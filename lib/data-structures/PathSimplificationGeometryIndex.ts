import Flatbush from "flatbush"
import RBush from "rbush"
import type { Obstacle } from "../types"
import type { HighDensityRoute } from "../types/high-density-types"
import { JUMPER_DIMENSIONS } from "../utils/jumperSizes"

type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
type IndexedRoute = Bounds & {
  route: HighDensityRoute
  routeIndex: number
  immutable: boolean
}

const roundingValue = new Float64Array(1)
const roundingBits = new BigUint64Array(roundingValue.buffer)

function roundOutward(value: number, upward: boolean): number {
  if (!Number.isFinite(value)) return value
  if (value === 0) return upward ? Number.MIN_VALUE : -Number.MIN_VALUE
  roundingValue[0] = value
  roundingBits[0] += (value > 0) === upward ? 1n : -1n
  return roundingValue[0]
}

function expandBoundsOutward(
  bounds: Bounds,
  marginX: number,
  marginY = marginX,
): Bounds {
  // Round operands as well as results so cancellation and different grouping
  // of margin arithmetic cannot shrink a conservative broad-phase rectangle.
  const expandedX = roundOutward(marginX, true)
  const expandedY = roundOutward(marginY, true)
  return {
    minX: roundOutward(roundOutward(bounds.minX, false) - expandedX, false),
    minY: roundOutward(roundOutward(bounds.minY, false) - expandedY, false),
    maxX: roundOutward(roundOutward(bounds.maxX, true) + expandedX, true),
    maxY: roundOutward(roundOutward(bounds.maxY, true) + expandedY, true),
  }
}

function getIndexedRoute(
  route: HighDensityRoute,
  routeIndex: number,
  immutable: boolean,
): IndexedRoute | undefined {
  const bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  }
  for (const point of route.route) {
    bounds.minX = Math.min(bounds.minX, point.x)
    bounds.minY = Math.min(bounds.minY, point.y)
    bounds.maxX = Math.max(bounds.maxX, point.x)
    bounds.maxY = Math.max(bounds.maxY, point.y)
  }
  for (const via of route.vias) {
    const viaBounds = expandBoundsOutward(
      { minX: via.x, minY: via.y, maxX: via.x, maxY: via.y },
      Math.abs(route.viaDiameter / 2),
    )
    bounds.minX = Math.min(bounds.minX, viaBounds.minX)
    bounds.minY = Math.min(bounds.minY, viaBounds.minY)
    bounds.maxX = Math.max(bounds.maxX, viaBounds.maxX)
    bounds.maxY = Math.max(bounds.maxY, viaBounds.maxY)
  }
  for (const jumper of route.jumpers ?? []) {
    const dimensions =
      JUMPER_DIMENSIONS[jumper.footprint] ?? JUMPER_DIMENSIONS["0603"]
    const horizontal =
      Math.abs(jumper.end.x - jumper.start.x) >
      Math.abs(jumper.end.y - jumper.start.y)
    const halfWidth =
      (horizontal ? dimensions.padLength : dimensions.padWidth) / 2
    const halfHeight =
      (horizontal ? dimensions.padWidth : dimensions.padLength) / 2
    for (const point of [jumper.start, jumper.end]) {
      const padBounds = expandBoundsOutward(
        { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y },
        halfWidth, halfHeight,
      )
      bounds.minX = Math.min(bounds.minX, padBounds.minX)
      bounds.minY = Math.min(bounds.minY, padBounds.minY)
      bounds.maxX = Math.max(bounds.maxX, padBounds.maxX)
      bounds.maxY = Math.max(bounds.maxY, padBounds.maxY)
    }
  }
  if (route.route.length === 0 && route.vias.length === 0 && !route.jumpers?.length) return undefined
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
    // A partly nonfinite route can still contain finite segments or vias.
    // Its original predicates must run; no finite broad phase can exclude it.
    return {
      minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity,
      route, routeIndex, immutable,
    }
  }
  return { ...expandBoundsOutward(bounds, 0), route, routeIndex, immutable }
}

/** Shares conservative geometry selection across a sequential simplification pass. */
export class PathSimplificationGeometryIndex {
  private readonly routeIndex = new RBush<IndexedRoute>()
  private readonly mutableRoutes: Array<IndexedRoute | undefined>
  private readonly obstacleIndex: Flatbush | undefined
  private readonly indexedObstacleIds: number[] = []
  private readonly unindexedObstacleIds: number[] = []

  constructor(
    routes: readonly HighDensityRoute[],
    immutableRoutes: readonly HighDensityRoute[],
    private readonly obstacles: readonly Obstacle[],
  ) {
    this.mutableRoutes = routes.map((route, index) =>
      getIndexedRoute(route, index, false),
    )
    const indexedRoutes = immutableRoutes.map((route, index) =>
      getIndexedRoute(route, index, true),
    ).concat(this.mutableRoutes).filter(
      (route): route is IndexedRoute => route !== undefined,
    )
    this.routeIndex.load(indexedRoutes)
    const obstacleBounds = obstacles.map((obstacle, index): Bounds => {
      const bounds = {
        minX: obstacle.center.x - obstacle.width / 2,
        minY: obstacle.center.y - obstacle.height / 2,
        maxX: obstacle.center.x + obstacle.width / 2,
        maxY: obstacle.center.y + obstacle.height / 2,
      }
      if (Object.values(bounds).every(Number.isFinite)) this.indexedObstacleIds.push(index)
      else this.unindexedObstacleIds.push(index)
      return bounds
    })
    if (this.indexedObstacleIds.length > 0) {
      this.obstacleIndex = new Flatbush(this.indexedObstacleIds.length)
      for (const index of this.indexedObstacleIds) {
        const bounds = obstacleBounds[index]
        this.obstacleIndex.add(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
      }
      this.obstacleIndex.finish()
    }
  }

  getCandidateObstacles(bounds: Bounds, margin: number): Obstacle[] {
    if (!Number.isFinite(margin) || !Object.values(bounds).every(Number.isFinite)) {
      return [...this.obstacles]
    }
    const query = expandBoundsOutward(bounds, Math.max(0, margin))
    const indices = this.obstacleIndex
      ? this.obstacleIndex.search(query.minX, query.minY, query.maxX, query.maxY)
          .map((index) => this.indexedObstacleIds[index])
      : []
    return indices.concat(this.unindexedObstacleIds)
      .sort((a, b) => a - b).map((index) => this.obstacles[index])
  }

  getCandidateRoutes(
    bounds: Bounds,
    margin: number,
    currentRouteIndex: number,
  ): HighDensityRoute[] {
    const finiteQuery = Number.isFinite(margin) && Object.values(bounds).every(Number.isFinite)
    const candidates = finiteQuery
      ? this.routeIndex.search(expandBoundsOutward(bounds, Math.max(0, margin)))
      : this.routeIndex.all()
    return candidates
      .filter((route) => route.immutable || route.routeIndex !== currentRouteIndex)
      .sort((a, b) => {
        // Match immutable + remaining original + already simplified order.
        const aGroup = a.immutable ? 0 : a.routeIndex > currentRouteIndex ? 1 : 2
        const bGroup = b.immutable ? 0 : b.routeIndex > currentRouteIndex ? 1 : 2
        return aGroup - bGroup || a.routeIndex - b.routeIndex
      })
      .map((route) => route.route)
  }

  replaceRoute(routeIndex: number, route: HighDensityRoute): void {
    if (!Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex >= this.mutableRoutes.length) {
      throw new Error(`Cannot replace path simplification route ${routeIndex}`)
    }
    const previous = this.mutableRoutes[routeIndex]
    if (previous) this.routeIndex.remove(previous)
    const replacement = getIndexedRoute(route, routeIndex, false)
    this.mutableRoutes[routeIndex] = replacement
    if (replacement) this.routeIndex.insert(replacement)
  }
}
