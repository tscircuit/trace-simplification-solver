import { FlatbushIndex } from "../../data-structures/FlatbushIndex"
import type { HighDensityIntraNodeRoute } from "../../types/high-density-types"
import { JUMPER_DIMENSIONS } from "../../utils/jumperSizes"

type RouteSource = "other" | "unsimplified"

interface IndexedRoute {
  routeIndex: number
  source: RouteSource
}

interface IndexedRouteWithBounds extends IndexedRoute {
  bounds: Bounds
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const DEFAULT_TRACE_THICKNESS = 0.15
const OBSTACLE_MARGIN = 0.1

const includePoint = (
  bounds: Bounds,
  point: { x: number; y: number },
  halfWidth: number,
  halfHeight = halfWidth,
): void => {
  bounds.minX = Math.min(bounds.minX, point.x - halfWidth)
  bounds.minY = Math.min(bounds.minY, point.y - halfHeight)
  bounds.maxX = Math.max(bounds.maxX, point.x + halfWidth)
  bounds.maxY = Math.max(bounds.maxY, point.y + halfHeight)
}

const getRouteCopperBounds = (
  route: HighDensityIntraNodeRoute,
): Bounds | null => {
  const bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  }
  const maximumTraceThickness = Math.max(
    DEFAULT_TRACE_THICKNESS,
    route.traceThickness,
    ...route.route.map((point) => point.traceThickness ?? route.traceThickness),
  )
  for (const point of route.route) {
    includePoint(bounds, point, maximumTraceThickness / 2)
  }
  for (const via of route.vias) {
    includePoint(bounds, via, route.viaDiameter / 2)
  }
  for (const jumper of route.jumpers ?? []) {
    const dimensions = JUMPER_DIMENSIONS[jumper.footprint]
    const isHorizontal =
      Math.abs(jumper.end.x - jumper.start.x) >
      Math.abs(jumper.end.y - jumper.start.y)
    const padWidth = isHorizontal ? dimensions.padLength : dimensions.padWidth
    const padHeight = isHorizontal ? dimensions.padWidth : dimensions.padLength
    includePoint(bounds, jumper.start, padWidth / 2, padHeight / 2)
    includePoint(bounds, jumper.end, padWidth / 2, padHeight / 2)
  }
  return Number.isFinite(bounds.minX) ? bounds : null
}

const getRoutePointBounds = (
  route: HighDensityIntraNodeRoute,
): Bounds | null => {
  if (route.route.length === 0) return null
  const bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  }
  for (const point of route.route) {
    includePoint(bounds, point, 0)
  }
  return bounds
}

const getIndexedRoutes = (
  routes: ReadonlyArray<HighDensityIntraNodeRoute>,
  source: RouteSource,
): IndexedRouteWithBounds[] =>
  routes.flatMap((route, routeIndex) => {
    const bounds = getRouteCopperBounds(route)
    return bounds ? [{ bounds, routeIndex, source }] : []
  })

export class SimplificationRouteSpatialIndex {
  private index: FlatbushIndex<IndexedRoute> | null = null
  private otherHdRoutes: ReadonlyArray<HighDensityIntraNodeRoute>
  private unsimplifiedHdRoutes: HighDensityIntraNodeRoute[]

  constructor(params: {
    otherHdRoutes: ReadonlyArray<HighDensityIntraNodeRoute>
    unsimplifiedHdRoutes: HighDensityIntraNodeRoute[]
  }) {
    this.otherHdRoutes = params.otherHdRoutes
    this.unsimplifiedHdRoutes = params.unsimplifiedHdRoutes
    const indexedRoutes = [
      ...getIndexedRoutes(this.otherHdRoutes, "other"),
      ...getIndexedRoutes(this.unsimplifiedHdRoutes, "unsimplified"),
    ]
    if (indexedRoutes.length === 0) return

    this.index = new FlatbushIndex<IndexedRoute>(indexedRoutes.length)
    for (const { bounds, routeIndex, source } of indexedRoutes) {
      this.index.insert(
        { routeIndex, source },
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
      )
    }
    this.index.finish()
  }

  getOtherHdRoutes(params: {
    currentRouteIndex: number
    simplifiedHdRoutes: HighDensityIntraNodeRoute[]
    useTraceWidthAwareClearance: boolean
  }): HighDensityIntraNodeRoute[] {
    const inputRoute = this.unsimplifiedHdRoutes[params.currentRouteIndex]
    const bounds = inputRoute ? getRoutePointBounds(inputRoute) : null
    if (!this.index || !bounds) return []
    const inputTraceThickness = params.useTraceWidthAwareClearance
      ? inputRoute.traceThickness
      : DEFAULT_TRACE_THICKNESS
    const margin = OBSTACLE_MARGIN + inputTraceThickness / 2
    const nearbyRoutes = this.index.search(
      bounds.minX - margin,
      bounds.minY - margin,
      bounds.maxX + margin,
      bounds.maxY + margin,
    )
    const nearbyOtherRouteIndices = nearbyRoutes
      .filter(({ source }) => source === "other")
      .map(({ routeIndex }) => routeIndex)
      .sort((a, b) => a - b)
    const nearbyFutureRouteIndices = nearbyRoutes
      .filter(
        ({ source, routeIndex }) =>
          source === "unsimplified" && routeIndex > params.currentRouteIndex,
      )
      .map(({ routeIndex }) => routeIndex)
      .sort((a, b) => a - b)
    const nearbySimplifiedRouteIndices = nearbyRoutes
      .filter(
        ({ source, routeIndex }) =>
          source === "unsimplified" && routeIndex < params.currentRouteIndex,
      )
      .map(({ routeIndex }) => routeIndex)
      .sort((a, b) => a - b)

    return [
      ...nearbyOtherRouteIndices.map((index) => this.otherHdRoutes[index]),
      ...nearbyFutureRouteIndices.map(
        (index) => this.unsimplifiedHdRoutes[index],
      ),
      ...nearbySimplifiedRouteIndices.map(
        (index) => params.simplifiedHdRoutes[index],
      ),
    ]
  }
}
