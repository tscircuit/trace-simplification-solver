import { ObstacleSpatialHashIndex } from "../../data-structures/ObstacleTree"
import { BaseSolver } from "../BaseSolver"
import {
  HighDensityIntraNodeRoute,
  HighDensityRoute,
} from "../../types/high-density-types"
import { Obstacle } from "../../types"
import { GraphicsObject } from "graphics-debug"
import { HighDensityRouteSpatialIndex } from "../../data-structures/HighDensityRouteSpatialIndex"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getJumpersGraphics } from "../../utils/getJumperGraphics"
import { createObjectsWithZLayers } from "../../utils/createObjectsWithZLayers"
import {
  pointToSegmentDistance,
  segmentToBoxMinDistance,
} from "@tscircuit/math-utils"
import { minimumDistanceBetweenSegments } from "../../utils/minimumDistanceBetweenSegments"
import { doesSegmentCrossPolygonBoundary } from "../../utils/polygonContainment"

export interface SameNetViaMergerSolverInput {
  inputHdRoutes: HighDensityRoute[]
  /** Routed copper that participates in collision checks but is never changed. */
  otherHdRoutes?: ReadonlyArray<HighDensityRoute>
  /** Explicit connection metadata for routes whose names are not in connMap. */
  netByConnectionName?: ReadonlyMap<string, string>
  obstacles: Obstacle[]
  colorMap: Record<string, string>
  layerCount: number
  connMap: ConnectivityMap
  outline?: Array<{ x: number; y: number }>
  /** Prevent transition clusters that touch a route endpoint from moving. */
  preserveRouteEndpoints?: boolean
  /**
   * DRC repair requires every changed wire to be clear and existing physical
   * contacts to survive. Omit for the original topology simplification pass,
   * whose intermediate copper is repaired by subsequent routing stages.
   */
  clearanceConstraints?: {
    traceMargin: number
    obstacleMargin: number
    boardEdgeMargin?: number
  }
  /** Additional reference checks for a clearance-preserving merge candidate. */
  acceptMerge?: (candidateRoutes: HighDensityRoute[]) => boolean
}

type Via = {
  x: number
  y: number
  diameter: number
  net: string
  routeIndex: number
  layers: number[]
  mutable: boolean
}

const NEAR_VIA_MERGE_DISTANCE_MULTIPLIER = 2.5
const OBSTACLE_MARGIN = 0.1

const viaTransitionClusterTouchesRouteEndpoint = (
  route: HighDensityRoute,
  viaPoint: { x: number; y: number },
): boolean => {
  for (let pointIndex = 0; pointIndex < route.route.length - 1; pointIndex++) {
    const point = route.route[pointIndex]!
    const nextPoint = route.route[pointIndex + 1]!
    if (
      point.z === nextPoint.z ||
      point.x !== viaPoint.x ||
      point.y !== viaPoint.y ||
      nextPoint.x !== viaPoint.x ||
      nextPoint.y !== viaPoint.y
    ) {
      continue
    }

    let clusterStartIndex = pointIndex
    while (
      clusterStartIndex > 0 &&
      route.route[clusterStartIndex - 1]!.x === viaPoint.x &&
      route.route[clusterStartIndex - 1]!.y === viaPoint.y
    ) {
      clusterStartIndex--
    }
    let clusterEndIndex = pointIndex + 1
    while (
      clusterEndIndex < route.route.length - 1 &&
      route.route[clusterEndIndex + 1]!.x === viaPoint.x &&
      route.route[clusterEndIndex + 1]!.y === viaPoint.y
    ) {
      clusterEndIndex++
    }
    if (clusterStartIndex === 0 || clusterEndIndex === route.route.length - 1) {
      return true
    }
  }
  return false
}

const tryGetNetForRoute = (
  connMap: ConnectivityMap,
  route: HighDensityRoute,
  netByConnectionName?: ReadonlyMap<string, string>,
): string | undefined =>
  netByConnectionName?.get(route.connectionName) ??
  connMap.idToNetMap[route.connectionName] ??
  (route.rootConnectionName
    ? connMap.idToNetMap[route.rootConnectionName]
    : undefined)

const getNetForRoute = (
  connMap: ConnectivityMap,
  route: HighDensityRoute,
  netByConnectionName?: ReadonlyMap<string, string>,
): string => {
  const net = tryGetNetForRoute(connMap, route, netByConnectionName)
  if (!net) {
    throw new Error(
      `SameNetViaMergerSolver could not find net for route "${route.connectionName}"`,
    )
  }

  return net
}

const obstacleIsSameNet = (
  connMap: ConnectivityMap,
  obstacle: Obstacle,
  via: Via,
): boolean => {
  for (const connectedId of obstacle.connectedTo) {
    if (connectedId === via.net) return true
    if (connMap.idToNetMap[connectedId] === via.net) return true
    if (connMap.areIdsConnected(connectedId, via.net)) return true
  }

  return false
}

const canMoveViaTo = (
  viaToRemove: Via,
  viaKeep: Via,
  context: {
    connMap: ConnectivityMap
    mergedViaHdRoutes: HighDensityRoute[]
    hdRouteSHI: HighDensityRouteSpatialIndex
    obstacleSHI: ObstacleSpatialHashIndex
    netByConnectionName?: ReadonlyMap<string, string>
  },
): boolean => {
  const route = context.mergedViaHdRoutes[viaToRemove.routeIndex]
  if (!route) {
    throw new Error(
      `SameNetViaMergerSolver could not find route for via at index ${viaToRemove.routeIndex}`,
    )
  }

  const transitionLayers = new Set<number>()
  for (let i = 1; i < route.route.length; i++) {
    const prev = route.route[i - 1]
    const curr = route.route[i]
    if (prev.z === curr.z) continue
    if (prev.x !== viaToRemove.x || prev.y !== viaToRemove.y) continue
    if (curr.x !== viaToRemove.x || curr.y !== viaToRemove.y) continue

    transitionLayers.add(prev.z)
    transitionLayers.add(curr.z)
  }

  if (transitionLayers.size === 0) {
    throw new Error(
      `SameNetViaMergerSolver could not find transition layers for via at (${viaToRemove.x}, ${viaToRemove.y})`,
    )
  }

  for (const z of transitionLayers) {
    const traceThickness = route.traceThickness
    const start = { x: viaToRemove.x, y: viaToRemove.y, z }
    const end = { x: viaKeep.x, y: viaKeep.y, z }

    if (start.x === end.x && start.y === end.y) continue

    const conflictingRoutes = context.hdRouteSHI.getConflictingRoutesForSegment(
      start,
      end,
      traceThickness / 2,
    )

    for (const { conflictingRoute, distance } of conflictingRoutes) {
      if (conflictingRoute.connectionName === route.connectionName) continue
      if (
        tryGetNetForRoute(
          context.connMap,
          conflictingRoute,
          context.netByConnectionName,
        ) === viaToRemove.net
      )
        continue

      const minDistance =
        traceThickness / 2 + conflictingRoute.traceThickness / 2
      if (distance < minDistance) return false
    }

    const segmentBox = {
      centerX: (start.x + end.x) / 2,
      centerY: (start.y + end.y) / 2,
      width: Math.abs(start.x - end.x),
      height: Math.abs(start.y - end.y),
    }
    const searchMargin = traceThickness / 2 + OBSTACLE_MARGIN
    const obstacles = context.obstacleSHI.searchArea(
      segmentBox.centerX,
      segmentBox.centerY,
      segmentBox.width + searchMargin * 2,
      segmentBox.height + searchMargin * 2,
    )

    for (const obstacle of obstacles) {
      if (!obstacle.__zLayers) {
        throw new Error(
          `SameNetViaMergerSolver found obstacle without zLayers near via at (${viaToRemove.x}, ${viaToRemove.y})`,
        )
      }
      if (!obstacle.__zLayers.includes(z)) continue
      if (obstacleIsSameNet(context.connMap, obstacle, viaToRemove)) continue
      if (segmentToBoxMinDistance(start, end, obstacle) < searchMargin) {
        return false
      }
    }
  }

  return true
}

const getTransitionPointIndices = (
  route: HighDensityRoute,
  via: { x: number; y: number },
): Set<number> => {
  const indices = new Set<number>()
  for (let i = 1; i < route.route.length; i++) {
    const a = route.route[i - 1]!
    const b = route.route[i]!
    if (
      a.z === b.z ||
      a.x !== via.x ||
      a.y !== via.y ||
      b.x !== via.x ||
      b.y !== via.y
    )
      continue
    let start = i - 1
    let end = i
    while (
      start > 0 &&
      route.route[start - 1]!.x === via.x &&
      route.route[start - 1]!.y === via.y
    )
      start--
    while (
      end + 1 < route.route.length &&
      route.route[end + 1]!.x === via.x &&
      route.route[end + 1]!.y === via.y
    )
      end++
    for (let j = start; j <= end; j++) indices.add(j)
  }
  if (indices.size === 0) {
    throw new Error(
      `SameNetViaMergerSolver could not find transition for via at (${via.x}, ${via.y}) on "${route.connectionName}"`,
    )
  }
  return indices
}

const getSegmentObstacleDistance = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  obstacle: Obstacle,
): number => {
  if (obstacle.shape === "circle") {
    return (
      pointToSegmentDistance(obstacle.center, start, end) - obstacle.width / 2
    )
  }
  const radians = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
  const cosine = Math.cos(radians),
    sine = Math.sin(radians)
  const a = {
    x:
      (start.x - obstacle.center.x) * cosine +
      (start.y - obstacle.center.y) * sine,
    y:
      -(start.x - obstacle.center.x) * sine +
      (start.y - obstacle.center.y) * cosine,
  }
  const b = {
    x:
      (end.x - obstacle.center.x) * cosine + (end.y - obstacle.center.y) * sine,
    y:
      -(end.x - obstacle.center.x) * sine +
      (end.y - obstacle.center.y) * cosine,
  }
  return segmentToBoxMinDistance(a, b, { ...obstacle, center: { x: 0, y: 0 } })
}

const routeTouchesSegment = (
  route: HighDensityRoute,
  start: HighDensityRoute["route"][number],
  end: HighDensityRoute["route"][number],
  radius: number,
): boolean => {
  for (let i = 1; i < route.route.length; i++) {
    const a = route.route[i - 1]!,
      b = route.route[i]!
    if (
      a.z !== start.z ||
      b.z !== start.z ||
      (a.insideJumperPad && b.insideJumperPad)
    )
      continue
    if (
      minimumDistanceBetweenSegments(start, end, a, b) <=
      radius + (a.traceThickness ?? route.traceThickness) / 2 + 1e-8
    )
      return true
  }
  return route.vias.some(
    (via) =>
      pointToSegmentDistance(via, start, end) <=
      radius + route.viaDiameter / 2 + 1e-8,
  )
}

const canMoveViaPreservingClearance = (
  viaToRemove: Via,
  viaKeep: Via,
  context: {
    connMap: ConnectivityMap
    mergedViaHdRoutes: HighDensityRoute[]
    hdRouteSHI: HighDensityRouteSpatialIndex
    obstacles: Obstacle[]
    netByConnectionName?: ReadonlyMap<string, string>
    traceMargin: number
    obstacleMargin: number
    boardEdgeMargin: number
    outline?: Array<{ x: number; y: number }>
  },
): boolean => {
  // Keeping the same copper diameter means the physical via copper is a subset
  // of the input: remove a site and reuse an already occupied one.
  if (viaToRemove.diameter !== viaKeep.diameter) return false
  const route = context.mergedViaHdRoutes[viaToRemove.routeIndex]!
  const indices = getTransitionPointIndices(route, viaToRemove)
  if ([...indices].some((i) => route.route[i]!.pcb_port_id)) return false
  for (let i = 1; i < route.route.length; i++) {
    if (!indices.has(i - 1) && !indices.has(i)) continue
    const originalStart = route.route[i - 1]!
    const originalEnd = route.route[i]!
    if (originalStart.z !== originalEnd.z) continue
    const start = indices.has(i - 1)
      ? { ...originalStart, x: viaKeep.x, y: viaKeep.y }
      : originalStart
    const end = indices.has(i)
      ? { ...originalEnd, x: viaKeep.x, y: viaKeep.y }
      : originalEnd
    const radius =
      Math.max(
        start.traceThickness ?? route.traceThickness,
        end.traceThickness ?? route.traceThickness,
      ) / 2
    // Check the resulting attached wires, not the old-to-new via trajectory.
    const conflicts = context.hdRouteSHI.getConflictingRoutesForSegment(
      start,
      end,
      radius + context.traceMargin,
    )
    if (
      conflicts.some(
        ({ conflictingRoute }) =>
          conflictingRoute.connectionName !== route.connectionName &&
          tryGetNetForRoute(
            context.connMap,
            conflictingRoute,
            context.netByConnectionName,
          ) !== viaToRemove.net,
      )
    )
      return false

    for (const obstacle of context.obstacles) {
      if (!obstacle.__zLayers)
        throw new Error("SameNetViaMergerSolver found obstacle without zLayers")
      if (!obstacle.__zLayers.includes(start.z)) continue
      if (obstacleIsSameNet(context.connMap, obstacle, viaToRemove)) continue
      if (
        getSegmentObstacleDistance(start, end, obstacle) <
        radius + context.obstacleMargin
      )
        return false
    }
    if (
      context.outline &&
      doesSegmentCrossPolygonBoundary({
        start,
        end,
        polygon: context.outline,
        margin: radius + context.boardEdgeMargin,
      })
    )
      return false
  }
  return true
}

export class SameNetViaMergerSolver extends BaseSolver {
  override getSolverName(): string {
    return "SameNetViaMergerSolver"
  }

  inputHdRoutes: HighDensityRoute[]
  mergedViaHdRoutes: HighDensityRoute[]
  unprocessedRoutes: HighDensityRoute[]
  vias: Via[]
  offendingVias: [Via, Via][]
  currentViaRoutes: HighDensityIntraNodeRoute[] = []
  connMap: ConnectivityMap
  colorMap: Record<string, string>
  outline?: Array<{ x: number; y: number }>
  obstacles: Obstacle[]
  viasByNet: Map<string, Via[]>
  netByConnectionName?: ReadonlyMap<string, string>

  obstacleSHI: ObstacleSpatialHashIndex
  hdRouteSHI: HighDensityRouteSpatialIndex

  private createHdRouteSpatialIndex(): HighDensityRouteSpatialIndex {
    const routes = [
      ...this.mergedViaHdRoutes,
      ...(this.input.otherHdRoutes ?? []),
    ]
    return new HighDensityRouteSpatialIndex(
      this.input.clearanceConstraints
        ? routes.map((route) => ({
            ...route,
            traceThickness: route.route.reduce(
              (width, point) =>
                Math.max(width, point.traceThickness ?? route.traceThickness),
              route.traceThickness,
            ),
          }))
        : routes,
    )
  }

  constructor(private input: SameNetViaMergerSolverInput) {
    super()
    if (!input.connMap) {
      throw new Error("SameNetViaMergerSolver requires connMap")
    }

    this.input = {
      ...input,
      obstacles: createObjectsWithZLayers(input.obstacles, input.layerCount),
    }
    if (input.acceptMerge && !input.clearanceConstraints) {
      throw new Error(
        "SameNetViaMergerSolver reference validation requires clearance constraints",
      )
    }
    if (input.clearanceConstraints) {
      const {
        traceMargin,
        obstacleMargin,
        boardEdgeMargin = 0,
      } = input.clearanceConstraints
      if (
        [traceMargin, obstacleMargin, boardEdgeMargin].some(
          (margin) => !Number.isFinite(margin) || margin < 0,
        )
      ) {
        throw new Error(
          "SameNetViaMergerSolver requires finite nonnegative margins",
        )
      }
    }
    this.MAX_ITERATIONS = 1e6
    this.inputHdRoutes = this.input.inputHdRoutes
    this.mergedViaHdRoutes = structuredClone(this.inputHdRoutes)
    for (const route of this.mergedViaHdRoutes) this.dedupeRouteVias(route)
    this.unprocessedRoutes = [...this.input.inputHdRoutes]
    this.colorMap = this.input.colorMap
    this.outline = this.input.outline
    this.obstacles = this.input.obstacles

    this.obstacleSHI = new ObstacleSpatialHashIndex(
      "flatbush",
      this.input.obstacles,
    )
    this.hdRouteSHI = this.createHdRouteSpatialIndex()
    this.vias = []
    this.offendingVias = []
    this.connMap = input.connMap
    this.netByConnectionName = input.netByConnectionName

    this.viasByNet = new Map<string, Via[]>()

    this.rebuildVias()
  }

  private rebuildVias(): void {
    this.vias = []
    this.viasByNet = new Map<string, Via[]>()

    const addRouteVias = (
      route: HighDensityRoute,
      routeIndex: number,
      mutable: boolean,
    ) => {
      if (route.vias.length === 0) return
      const net = mutable
        ? getNetForRoute(this.connMap, route, this.netByConnectionName)
        : tryGetNetForRoute(this.connMap, route, this.netByConnectionName)
      if (!net) return

      for (let j = 0; j < route.vias.length; j++) {
        const viaPoint = route.vias[j]
        const layers = [...new Set(route.route.map((p) => p.z))]
        if (layers.length === 0) {
          throw new Error(
            `SameNetViaMergerSolver found via on route "${route.connectionName}" with no route points`,
          )
        }

        const via: Via = {
          x: viaPoint.x,
          y: viaPoint.y,
          diameter: route.viaDiameter,
          net,
          layers,
          routeIndex,
          mutable:
            mutable &&
            !(
              this.input.clearanceConstraints &&
              (route.jumpers?.length ||
                route.route.some(
                  (point) => point.insideJumperPad || point.toNextSegmentType,
                ))
            ) &&
            !(
              this.input.preserveRouteEndpoints &&
              viaTransitionClusterTouchesRouteEndpoint(route, viaPoint)
            ),
        }
        this.vias.push(via)
        const list = this.viasByNet.get(via.net)
        if (list) list.push(via)
        else this.viasByNet.set(via.net, [via])
      }
    }

    for (let i = 0; i < this.mergedViaHdRoutes.length; i++) {
      addRouteVias(this.mergedViaHdRoutes[i]!, i, true)
    }
    for (let i = 0; i < (this.input.otherHdRoutes?.length ?? 0); i++) {
      addRouteVias(
        this.input.otherHdRoutes![i]!,
        this.mergedViaHdRoutes.length + i,
        false,
      )
    }
  }

  private getViaLocationKey(via: Via): string {
    return [via.net, via.x, via.y].join(":")
  }

  private dedupeRouteVias(route: HighDensityRoute): void {
    const seenViaLocations = new Set<string>()
    route.vias = route.vias.filter((via) => {
      const key = `${via.x}:${via.y}`
      if (seenViaLocations.has(key)) return false
      seenViaLocations.add(key)
      return true
    })
  }

  private getOffendingViaGroupsBatch(): Array<{ keep: Via; remove: Via[] }> {
    const groups: Array<{ keep: Via; remove: Via[] }> = []
    const touchedViaKeys = new Set<string>()
    const candidateGroups: Array<{ keep: Via; remove: Via[] }> = []

    for (const viasInNet of this.viasByNet.values()) {
      if (viasInNet.length < 2) continue

      const maxDiameter = Math.max(
        1e-6,
        ...viasInNet.map((via) => via.diameter),
      )
      const cellSize = maxDiameter
      const buckets = new Map<string, number[]>()
      const viasAtLocation = new Map<string, Via[]>()

      // Build stars instead of connected components so a via is only moved to
      // another via that directly overlaps or has a clear short same-net merge.
      for (let viaIndex = 0; viaIndex < viasInNet.length; viaIndex++) {
        const via = viasInNet[viaIndex]
        const locationKey = this.getViaLocationKey(via)
        const colocated = viasAtLocation.get(locationKey)
        if (colocated) colocated.push(via)
        else viasAtLocation.set(locationKey, [via])
        const cellX = Math.floor(via.x / cellSize)
        const cellY = Math.floor(via.y / cellSize)
        const bucketKey = `${cellX}:${cellY}`
        const bucket = buckets.get(bucketKey)
        if (bucket) bucket.push(viaIndex)
        else buckets.set(bucketKey, [viaIndex])
      }

      for (let viaIndex = 0; viaIndex < viasInNet.length; viaIndex++) {
        const keep = viasInNet[viaIndex]
        const cellX = Math.floor(keep.x / cellSize)
        const cellY = Math.floor(keep.y / cellSize)
        const neighborCellRadius = Math.ceil(NEAR_VIA_MERGE_DISTANCE_MULTIPLIER)
        const remove: Via[] = []

        for (let dx = -neighborCellRadius; dx <= neighborCellRadius; dx++) {
          for (let dy = -neighborCellRadius; dy <= neighborCellRadius; dy++) {
            const bucket = buckets.get(`${cellX + dx}:${cellY + dy}`)
            if (!bucket) continue

            for (const candidateIndex of bucket) {
              if (candidateIndex === viaIndex) continue

              const candidate = viasInNet[candidateIndex]
              if (!candidate.mutable) continue

              const pairDx = keep.x - candidate.x
              const pairDy = keep.y - candidate.y
              const squaredDistance = pairDx * pairDx + pairDy * pairDy
              const directOverlapDistance =
                keep.diameter / 2 + candidate.diameter / 2
              const nearMergeDistance =
                directOverlapDistance * NEAR_VIA_MERGE_DISTANCE_MULTIPLIER

              // Co-located route entries already describe one physical via.
              if (squaredDistance === 0) continue

              if (this.input.clearanceConstraints) {
                if (
                  squaredDistance <= nearMergeDistance * nearMergeDistance &&
                  canMoveViaPreservingClearance(candidate, keep, {
                    connMap: this.connMap,
                    mergedViaHdRoutes: this.mergedViaHdRoutes,
                    hdRouteSHI: this.hdRouteSHI,
                    obstacles: this.obstacles,
                    netByConnectionName: this.netByConnectionName,
                    ...this.input.clearanceConstraints,
                    boardEdgeMargin:
                      this.input.clearanceConstraints.boardEdgeMargin ?? 0,
                    outline: this.outline,
                  })
                )
                  remove.push(candidate)
                continue
              }

              if (
                squaredDistance <=
                directOverlapDistance * directOverlapDistance
              ) {
                remove.push(candidate)
                continue
              }

              if (
                squaredDistance <= nearMergeDistance * nearMergeDistance &&
                canMoveViaTo(candidate, keep, {
                  connMap: this.connMap,
                  mergedViaHdRoutes: this.mergedViaHdRoutes,
                  hdRouteSHI: this.hdRouteSHI,
                  obstacleSHI: this.obstacleSHI,
                  netByConnectionName: this.netByConnectionName,
                })
              ) {
                remove.push(candidate)
              }
            }
          }
        }

        // A shared physical via can only move when every attached route can
        // follow it. Moving a subset leaves the old site occupied and lets the
        // next pass move those same routes back, without eliminating a via.
        const removable = new Set(remove)
        const completeLocations = remove.filter(
          (via) =>
            (via.x === keep.x && via.y === keep.y) ||
            viasAtLocation
              .get(this.getViaLocationKey(via))!
              .every((attached) => attached.mutable && removable.has(attached)),
        )
        if (completeLocations.length > 0) {
          candidateGroups.push({ keep, remove: completeLocations })
        }
      }
    }

    candidateGroups.sort((a, b) => {
      if (b.remove.length !== a.remove.length) {
        return b.remove.length - a.remove.length
      }
      if (a.keep.mutable !== b.keep.mutable) {
        return a.keep.mutable ? 1 : -1
      }
      if (b.keep.layers.length !== a.keep.layers.length) {
        return b.keep.layers.length - a.keep.layers.length
      }

      return a.keep.routeIndex - b.keep.routeIndex
    })

    // A rejected repair target must not suppress a safe alternative target.
    if (this.input.clearanceConstraints) return candidateGroups

    for (const candidateGroup of candidateGroups) {
      const keepKey = this.getViaLocationKey(candidateGroup.keep)
      if (touchedViaKeys.has(keepKey)) continue

      const remove = candidateGroup.remove.filter(
        (viaToRemove) =>
          !touchedViaKeys.has(this.getViaLocationKey(viaToRemove)),
      )
      if (remove.length === 0) continue

      groups.push({ keep: candidateGroup.keep, remove })
      touchedViaKeys.add(keepKey)
      for (const viaToRemove of remove) {
        touchedViaKeys.add(this.getViaLocationKey(viaToRemove))
      }
    }

    return groups
  }

  private moveViaTo(viaToRemove: Via, viaKeep: Via, rebuildVias = true): void {
    if (!viaToRemove.mutable) {
      throw new Error(
        "SameNetViaMergerSolver cannot mutate an immutable via anchor",
      )
    }
    const routeToUpdate = this.mergedViaHdRoutes[viaToRemove.routeIndex]
    if (!routeToUpdate) {
      throw new Error(
        `SameNetViaMergerSolver could not find route for via at index ${viaToRemove.routeIndex}`,
      )
    }

    const route = routeToUpdate.route
    const routePointIndexesToMove = getTransitionPointIndices(
      routeToUpdate,
      viaToRemove,
    )
    let replacedVia = false

    for (const routePointIndex of routePointIndexesToMove) {
      const point = route[routePointIndex]
      route[routePointIndex] = { ...point, x: viaKeep.x, y: viaKeep.y }
    }

    // Each route must retain its layer-transition via, even when the physical
    // drill is shared with immutable copper owned by another route.
    routeToUpdate.vias = routeToUpdate.vias.map((vx) => {
      if (vx.x !== viaToRemove.x || vx.y !== viaToRemove.y) return vx
      replacedVia = true
      return { x: viaKeep.x, y: viaKeep.y }
    })
    if (!replacedVia) {
      throw new Error(
        `SameNetViaMergerSolver could not find via at (${viaToRemove.x}, ${viaToRemove.y}) on route "${routeToUpdate.connectionName}"`,
      )
    }

    this.dedupeRouteVias(routeToUpdate)
    if (rebuildVias) this.rebuildVias()
  }

  private preservesSameNetContacts(previous: HighDensityRoute[]): boolean {
    const beforeByName = new Map(
      [...previous, ...(this.input.otherHdRoutes ?? [])].map((route) => [
        route.connectionName,
        route,
      ]),
    )
    const afterByName = new Map(
      [...this.mergedViaHdRoutes, ...(this.input.otherHdRoutes ?? [])].map(
        (route) => [route.connectionName, route],
      ),
    )
    for (let ri = 0; ri < previous.length; ri++) {
      const original = previous[ri]!
      const candidate = this.mergedViaHdRoutes[ri]!
      if (original === candidate) continue
      const net = getNetForRoute(
        this.connMap,
        original,
        this.netByConnectionName,
      )
      const pieces: Array<{
        beforeStart: HighDensityRoute["route"][number]
        beforeEnd: HighDensityRoute["route"][number]
        afterStart: HighDensityRoute["route"][number]
        afterEnd: HighDensityRoute["route"][number]
        radius: number
      }> = []
      for (let pi = 1; pi < original.route.length; pi++) {
        const a = original.route[pi - 1]!,
          b = original.route[pi]!
        const c = candidate.route[pi - 1]!,
          d = candidate.route[pi]!
        if (
          a.z !== b.z ||
          (a.x === c.x && a.y === c.y && b.x === d.x && b.y === d.y)
        )
          continue
        pieces.push({
          beforeStart: a,
          beforeEnd: b,
          afterStart: c,
          afterEnd: d,
          radius: (a.traceThickness ?? original.traceThickness) / 2,
        })
      }
      for (const via of original.vias) {
        if (candidate.vias.some((v) => v.x === via.x && v.y === via.y)) continue
        const index = getTransitionPointIndices(original, via).values().next()
          .value!
        const destination = candidate.route[index]!
        for (let z = 0; z < this.input.layerCount; z++) {
          pieces.push({
            beforeStart: { ...via, z },
            beforeEnd: { ...via, z },
            afterStart: { ...destination, z },
            afterEnd: { ...destination, z },
            radius: original.viaDiameter / 2,
          })
        }
      }
      for (const piece of pieces) {
        const before = this.hdRouteSHI.getConflictingRoutesForSegment(
          piece.beforeStart,
          piece.beforeEnd,
          piece.radius + 1e-8,
        )
        if (
          before.some(
            ({ conflictingRoute }) =>
              conflictingRoute.connectionName !== original.connectionName &&
              tryGetNetForRoute(
                this.connMap,
                conflictingRoute,
                this.netByConnectionName,
              ) === net &&
              routeTouchesSegment(
                beforeByName.get(conflictingRoute.connectionName)!,
                piece.beforeStart,
                piece.beforeEnd,
                piece.radius,
              ) &&
              !routeTouchesSegment(
                afterByName.get(conflictingRoute.connectionName)!,
                piece.afterStart,
                piece.afterEnd,
                piece.radius,
              ),
          )
        )
          return false
        // A pad can be a branch contact even when it is not a route endpoint.
        for (const obstacle of this.obstacles) {
          if (!obstacle.__zLayers!.includes(piece.beforeStart.z)) continue
          if (
            !obstacle.connectedTo.some(
              (id) =>
                id === net ||
                this.connMap.idToNetMap[id] === net ||
                this.connMap.areIdsConnected(id, net),
            )
          )
            continue
          if (
            getSegmentObstacleDistance(
              piece.beforeStart,
              piece.beforeEnd,
              obstacle,
            ) <=
              piece.radius + 1e-8 &&
            getSegmentObstacleDistance(
              piece.afterStart,
              piece.afterEnd,
              obstacle,
            ) >
              piece.radius + 1e-8
          )
            return false
        }
      }
    }
    return true
  }

  private stepClearancePreservingMerge(): void {
    // Publish one same-net group at a time. Every later group must be checked
    // against the newly shaped copper, including moves on other nets.
    for (const group of this.getOffendingViaGroupsBatch()) {
      const previous = this.mergedViaHdRoutes
      this.mergedViaHdRoutes = previous.map((route, index) =>
        group.remove.some((via) => via.routeIndex === index)
          ? structuredClone(route)
          : route,
      )
      for (const via of group.remove) this.moveViaTo(via, group.keep, false)
      if (
        !this.preservesSameNetContacts(previous) ||
        (this.input.acceptMerge &&
          !this.input.acceptMerge(this.mergedViaHdRoutes))
      ) {
        this.mergedViaHdRoutes = previous
        continue
      }
      this.rebuildVias()
      this.hdRouteSHI = this.createHdRouteSpatialIndex()
      this.stats.mergedViaGroups = (this.stats.mergedViaGroups ?? 0) + 1
      this.stats.mergedViaCount =
        (this.stats.mergedViaCount ?? 0) + group.remove.length
      return
    }
    this.solved = true
  }

  _step(): void {
    if (this.input.clearanceConstraints) {
      this.stepClearancePreservingMerge()
      return
    }
    const groups = this.getOffendingViaGroupsBatch()

    if (groups.length === 0) {
      this.solved = true
      return
    }

    let mergedViaCount = 0
    for (const group of groups) {
      for (const viaToRemove of group.remove) {
        this.moveViaTo(viaToRemove, group.keep, false)
        mergedViaCount++
      }
    }
    this.rebuildVias()
    this.hdRouteSHI = this.createHdRouteSpatialIndex()
    this.stats.mergedViaGroups = groups.length
    this.stats.mergedViaCount = mergedViaCount
  }

  getMergedViaHdRoutes(): HighDensityRoute[] | null {
    return this.mergedViaHdRoutes
  }

  visualize(): GraphicsObject {
    const visualization: GraphicsObject &
      Pick<Required<GraphicsObject>, "points" | "lines" | "rects" | "circles"> =
      {
        lines: [],
        points: [],
        rects: [],
        circles: [],
        coordinateSystem: "cartesian",
        title: "Same Net Via Merger Solver",
      }

    // Visualize obstacles
    for (const obstacle of this.input.obstacles) {
      if (!obstacle.__zLayers) {
        throw new Error(
          `SameNetViaMergerSolver found obstacle without zLayers while visualizing`,
        )
      }

      let fillColor = "rgba(128, 128, 128, 0.2)" // Default faded gray
      const strokeColor = "rgba(128, 128, 128, 0.5)"
      const isOnLayer0 = obstacle.__zLayers.includes(0)
      const isOnLayer1 = obstacle.__zLayers.includes(1)

      if (isOnLayer0 && isOnLayer1) {
        fillColor = "rgba(128, 0, 128, 0.2)" // Faded purple for both layers
      } else if (isOnLayer0) {
        fillColor = "rgba(255, 0, 0, 0.2)" // Faded red for layer 0
      } else if (isOnLayer1) {
        fillColor = "rgba(0, 0, 255, 0.2)" // Faded blue for layer 1
      }

      visualization.rects.push({
        center: obstacle.center,
        width: obstacle.width,
        height: obstacle.height,
        fill: fillColor,
        label: `Obstacle (Z: ${obstacle.__zLayers?.join(", ")})`,
      })
    }

    // Display each optimized route
    for (const route of this.mergedViaHdRoutes) {
      // Skip routes with no points
      if (route.route.length === 0) continue

      const color = this.input.colorMap[route.connectionName]
      if (!color) {
        throw new Error(
          `SameNetViaMergerSolver could not find color for route "${route.connectionName}"`,
        )
      }

      // Add lines connecting route points on the same layer
      for (let i = 0; i < route.route.length - 1; i++) {
        const current = route.route[i]
        const next = route.route[i + 1]

        // Only draw segments that are on the same layer
        if (current.z === next.z) {
          visualization.lines.push({
            points: [
              { x: current.x, y: current.y },
              { x: next.x, y: next.y },
            ],
            strokeColor:
              current.z === 0 ? "rgba(255, 0, 0, 0.5)" : "rgba(0, 0, 255, 0.5)",
            strokeWidth: route.traceThickness,
            label: `${route.connectionName} (z=${current.z})`,
          })
        }
      }

      // Add circles for vias
      for (const via of route.vias) {
        visualization.circles.push({
          center: { x: via.x, y: via.y },
          radius: route.viaDiameter / 2,
          fill: "rgba(255, 0, 255, 0.5)",
          label: `${route.connectionName} via`,
        })
      }

      // Draw jumpers
      if (route.jumpers && route.jumpers.length > 0) {
        const jumperGraphics = getJumpersGraphics(route.jumpers, {
          color,
          label: route.connectionName,
        })
        if (!jumperGraphics.rects || !jumperGraphics.lines) {
          throw new Error(
            `SameNetViaMergerSolver expected jumper graphics for route "${route.connectionName}"`,
          )
        }
        visualization.rects.push(...jumperGraphics.rects)
        visualization.lines.push(...jumperGraphics.lines)
      }
    }

    return visualization
  }
}
