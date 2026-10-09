import {
  doSegmentsIntersect,
  pointToSegmentDistance,
} from "@tscircuit/math-utils"
import {
  HighDensityIntraNodeRoute,
  Jumper,
} from "../../types/high-density-types"
import { BaseSolver } from "../BaseSolver"
import { Obstacle } from "../../types"
import { GraphicsObject } from "graphics-debug"
import { SingleSimplifiedPathSolver } from "./SingleSimplifiedPathSolver"
import { calculate45DegreePaths } from "../../utils/calculate45DegreePaths"
import { minimumDistanceBetweenSegments } from "../../utils/minimumDistanceBetweenSegments"
import { SegmentTree } from "../../data-structures/SegmentTree"
import {
  segmentToBoxMinDistance,
  computeGapBetweenBoxes,
  segmentToBoundsMinDistance,
} from "@tscircuit/math-utils"
import { doesSegmentCrossPolygonBoundary } from "../../utils/polygonContainment"
import { JUMPER_DIMENSIONS } from "../../utils/jumperSizes"
import {
  type IndexedRouteJumperPad,
  type IndexedRouteSegment,
  type IndexedRouteVia,
  SimplificationRouteObstacleIndex,
} from "./SimplificationRouteObstacleIndex"

interface Point {
  x: number
  y: number
  z: number
}

interface PathSegment {
  start: Point
  end: Point
  length: number
  startDistance: number
  endDistance: number
}

// Try 4 mm, 1 mm, and 0.25 mm before committing one preserved-route step.
const MAXIMUM_ATTEMPTS_PER_PROGRESS_STEP = 4

export class SingleSimplifiedPathSolver5 extends SingleSimplifiedPathSolver {
  private pathSegments: PathSegment[] = []
  private totalPathLength: number = 0
  private headDistanceAlongPath: number = 0
  private tailDistanceAlongPath: number = 0
  private minStepSize: number = 0.25 // Default step size, can be adjusted
  private lastValidPath: Point[] | null = null // Store the current valid path
  private lastValidPathHeadDistance: number = 0

  /** Amount the step size is reduced when the step isn't possible */
  STEP_SIZE_REDUCTION_FACTOR = 0.25
  maxStepSize = 4
  currentStepSize = this.maxStepSize
  lastHeadMoveDistance = 0

  cachedValidPathSegments: Set<string>

  filteredObstacles: Obstacle[] = []
  filteredObstaclePathSegments: Array<[Point, Point]> = []
  traceThicknessByObstacleSegmentId = new Map<string, number>()
  filteredVias: Array<{ x: number; y: number; diameter: number }> = []
  filteredJumperPads: Array<{
    center: { x: number; y: number }
    width: number
    height: number
    connectionName: string
  }> = []

  /** Indices in inputRoute.route that correspond to jumper pad points (must be preserved) */
  jumperPadPointIndices: Set<number> = new Set()

  segmentTree!: SegmentTree

  OBSTACLE_MARGIN = 0.1
  TRACE_THICKNESS = 0.15
  private useTraceWidthAwareClearance = false
  private clearanceTraceThickness = this.TRACE_THICKNESS

  TAIL_JUMP_RATIO: number = 0.8

  private isSameNetRoute(otherRoute: HighDensityIntraNodeRoute): boolean {
    const inputRouteNet =
      this.netByConnectionName?.get(this.inputRoute.connectionName) ??
      (this.inputRoute.rootConnectionName
        ? this.netByConnectionName?.get(this.inputRoute.rootConnectionName)
        : undefined)
    const otherRouteNet =
      this.netByConnectionName?.get(otherRoute.connectionName) ??
      (otherRoute.rootConnectionName
        ? this.netByConnectionName?.get(otherRoute.rootConnectionName)
        : undefined)
    if (inputRouteNet !== undefined && otherRouteNet !== undefined) {
      return inputRouteNet === otherRouteNet
    }

    const inputRouteIds = [
      this.inputRoute.connectionName,
      this.inputRoute.rootConnectionName,
    ].filter((id): id is string => id !== undefined)
    const otherRouteIds = [
      otherRoute.connectionName,
      otherRoute.rootConnectionName,
    ].filter((id): id is string => id !== undefined)

    return inputRouteIds.some((inputRouteId) =>
      otherRouteIds.some(
        (otherRouteId) =>
          inputRouteId === otherRouteId ||
          this.connMap.areIdsConnected(inputRouteId, otherRouteId),
      ),
    )
  }

  constructor(
    params: ConstructorParameters<typeof SingleSimplifiedPathSolver>[0] & {
      useTraceWidthAwareClearance?: boolean
      simplificationRouteObstacleIndex?: SimplificationRouteObstacleIndex
      currentRouteIndex?: number
    },
  ) {
    super(params)

    this.cachedValidPathSegments = new Set()
    this.useTraceWidthAwareClearance =
      params.useTraceWidthAwareClearance ?? false
    this.clearanceTraceThickness = this.useTraceWidthAwareClearance
      ? this.inputRoute.traceThickness
      : this.TRACE_THICKNESS

    // Handle empty or single-point routes
    if (this.inputRoute.route.length <= 1) {
      this.newRoute = [...this.inputRoute.route]
      this.solved = true
      return
    }

    const bounds = this.inputRoute.route.reduce(
      (acc, point) => {
        acc.minX = Math.min(acc.minX, point.x)
        acc.maxX = Math.max(acc.maxX, point.x)
        acc.minY = Math.min(acc.minY, point.y)
        acc.maxY = Math.max(acc.maxY, point.y)
        return acc
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    )
    const maximumOtherTraceThickness = this.useTraceWidthAwareClearance
      ? (params.simplificationRouteObstacleIndex?.maximumTraceThickness ??
        Math.max(
          0,
          ...this.otherHdRoutes.flatMap((route) => [
            route.traceThickness,
            ...route.route.map(
              (point) => point.traceThickness ?? route.traceThickness,
            ),
          ]),
        ))
      : this.TRACE_THICKNESS
    const routeSegmentMargin = this.useTraceWidthAwareClearance
      ? this.OBSTACLE_MARGIN +
        this.clearanceTraceThickness / 2 +
        maximumOtherTraceThickness / 2
      : this.OBSTACLE_MARGIN + this.TRACE_THICKNESS
    const boundsBox = {
      center: {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      },
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    }

    const obstacleSearchMargin =
      this.OBSTACLE_MARGIN + this.clearanceTraceThickness / 2
    if (
      params.simplificationRouteObstacleIndex &&
      params.currentRouteIndex === undefined
    ) {
      throw new Error(
        "currentRouteIndex is required with simplificationRouteObstacleIndex",
      )
    }
    const nearbyFeatures =
      params.simplificationRouteObstacleIndex?.getNearbyFeatures({
        bounds,
        currentRouteIndex: params.currentRouteIndex ?? 0,
        margin: routeSegmentMargin,
      })
    this.filteredObstacles = this.obstacleIndex
      .search({
        minX: bounds.minX - obstacleSearchMargin,
        minY: bounds.minY - obstacleSearchMargin,
        maxX: bounds.maxX + obstacleSearchMargin,
        maxY: bounds.maxY + obstacleSearchMargin,
      })
      .filter((obstacle) => {
        if (
          obstacle.connectedTo.some((connectedId) =>
            this.connMap.areIdsConnected(
              this.inputRoute.connectionName,
              connectedId,
            ),
          )
        ) {
          return false
        }

        return (
          computeGapBetweenBoxes(boundsBox, obstacle) < obstacleSearchMargin
        )
      })

    const indexedSegments = nearbyFeatures?.filter(
      (feature): feature is IndexedRouteSegment => feature.kind === "segment",
    )
    const obstacleRouteSegments = indexedSegments
      ? indexedSegments.map(({ route, start, end, traceThickness }) => ({
          route,
          start,
          end,
          traceThickness,
        }))
      : this.otherHdRoutes.flatMap((route) =>
          route.route.slice(0, -1).map((start, segmentIndex) => {
            const end = route.route[segmentIndex + 1]
            return {
              route,
              start,
              end,
              traceThickness: Math.max(
                start.traceThickness ?? route.traceThickness,
                end.traceThickness ?? route.traceThickness,
              ),
            }
          }),
        )
    this.filteredObstaclePathSegments = obstacleRouteSegments.flatMap(
      ({ route, start, end, traceThickness }) => {
        if (
          this.isSameNetRoute(route) ||
          segmentToBoundsMinDistance(start, end, bounds) > routeSegmentMargin
        ) {
          return []
        }

        if (this.useTraceWidthAwareClearance) {
          const segmentId = `${start.x}-${start.y}-${start.z}-${end.x}-${end.y}-${end.z}`
          this.traceThicknessByObstacleSegmentId.set(
            segmentId,
            Math.max(
              this.traceThicknessByObstacleSegmentId.get(segmentId) ?? 0,
              traceThickness,
            ),
          )
        }
        return [[start, end] as [Point, Point]]
      },
    )
    this.segmentTree = this.useTraceWidthAwareClearance
      ? new SegmentTree(this.filteredObstaclePathSegments, routeSegmentMargin)
      : new SegmentTree(this.filteredObstaclePathSegments)

    const indexedVias = nearbyFeatures?.filter(
      (feature): feature is IndexedRouteVia => feature.kind === "via",
    )
    const obstacleVias = indexedVias
      ? indexedVias.map(({ route, center, diameter }) => ({
          route,
          via: center,
          diameter,
        }))
      : this.otherHdRoutes.flatMap((route) =>
          route.vias.map((via) => ({
            route,
            via,
            diameter: route.viaDiameter,
          })),
        )
    this.filteredVias = obstacleVias.flatMap(({ route, via, diameter }) => {
      if (this.isSameNetRoute(route)) {
        return []
      }

      const filteredVias: Array<{ x: number; y: number; diameter: number }> = []
      const margin =
        this.OBSTACLE_MARGIN + this.clearanceTraceThickness / 2 + diameter / 2
      const minX = via.x - margin
      const maxX = via.x + margin
      const minY = via.y - margin
      const maxY = via.y + margin

      if (
        minX <= bounds.maxX &&
        maxX >= bounds.minX &&
        minY <= bounds.maxY &&
        maxY >= bounds.minY
      ) {
        filteredVias.push({ ...via, diameter })
      }
      return filteredVias
    })

    // Helper function to extract jumper pads from a route
    const extractJumperPads = (
      jumpers: Jumper[],
      connectionName: string,
    ): Array<{
      center: { x: number; y: number }
      width: number
      height: number
      connectionName: string
    }> => {
      const pads: Array<{
        center: { x: number; y: number }
        width: number
        height: number
        connectionName: string
      }> = []

      for (const jumper of jumpers) {
        const dims =
          JUMPER_DIMENSIONS[jumper.footprint] ?? JUMPER_DIMENSIONS["0603"]

        // Determine jumper orientation to get correct pad dimensions
        const dx = jumper.end.x - jumper.start.x
        const dy = jumper.end.y - jumper.start.y
        const isHorizontal = Math.abs(dx) > Math.abs(dy)
        const padWidth = isHorizontal ? dims.padLength : dims.padWidth
        const padHeight = isHorizontal ? dims.padWidth : dims.padLength

        // Check if start pad is within bounds
        const startMargin =
          this.OBSTACLE_MARGIN + this.clearanceTraceThickness / 2
        if (
          jumper.start.x - padWidth / 2 - startMargin <= bounds.maxX &&
          jumper.start.x + padWidth / 2 + startMargin >= bounds.minX &&
          jumper.start.y - padHeight / 2 - startMargin <= bounds.maxY &&
          jumper.start.y + padHeight / 2 + startMargin >= bounds.minY
        ) {
          pads.push({
            center: jumper.start,
            width: padWidth,
            height: padHeight,
            connectionName: connectionName,
          })
        }

        // Check if end pad is within bounds
        if (
          jumper.end.x - padWidth / 2 - startMargin <= bounds.maxX &&
          jumper.end.x + padWidth / 2 + startMargin >= bounds.minX &&
          jumper.end.y - padHeight / 2 - startMargin <= bounds.maxY &&
          jumper.end.y + padHeight / 2 + startMargin >= bounds.minY
        ) {
          pads.push({
            center: jumper.end,
            width: padWidth,
            height: padHeight,
            connectionName: connectionName,
          })
        }
      }

      return pads
    }

    // Collect jumper pads from other routes as obstacles
    const indexedJumperPads = nearbyFeatures?.filter(
      (feature): feature is IndexedRouteJumperPad =>
        feature.kind === "jumper_pad",
    )
    this.filteredJumperPads = indexedJumperPads
      ? indexedJumperPads.flatMap(({ route, center, width, height }) => {
          if (this.isSameNetRoute(route)) return []
          const margin = this.OBSTACLE_MARGIN + this.clearanceTraceThickness / 2
          if (
            center.x - width / 2 - margin > bounds.maxX ||
            center.x + width / 2 + margin < bounds.minX ||
            center.y - height / 2 - margin > bounds.maxY ||
            center.y + height / 2 + margin < bounds.minY
          ) {
            return []
          }
          return [
            {
              center,
              width,
              height,
              connectionName: route.connectionName,
            },
          ]
        })
      : this.otherHdRoutes.flatMap((route) => {
          if (this.isSameNetRoute(route)) return []
          return extractJumperPads(route.jumpers ?? [], route.connectionName)
        })

    // Also add our own route's jumper pads as obstacles
    // (we shouldn't simplify traces through our own jumper pads)
    if (this.inputRoute.jumpers && this.inputRoute.jumpers.length > 0) {
      this.filteredJumperPads.push(
        ...extractJumperPads(
          this.inputRoute.jumpers,
          this.inputRoute.connectionName,
        ),
      )

      // Identify which route points correspond to our jumper pads
      // These points MUST be preserved during simplification
      for (const jumper of this.inputRoute.jumpers) {
        for (let i = 0; i < this.inputRoute.route.length; i++) {
          const p = this.inputRoute.route[i]
          // Check if this point matches start or end of jumper
          if (
            (Math.abs(p.x - jumper.start.x) < 0.01 &&
              Math.abs(p.y - jumper.start.y) < 0.01) ||
            (Math.abs(p.x - jumper.end.x) < 0.01 &&
              Math.abs(p.y - jumper.end.y) < 0.01)
          ) {
            this.jumperPadPointIndices.add(i)
          }
        }
      }
    }

    // Compute path segments and total length
    this.computePathSegments()
    if (this.inputRoute.route.length > this.MAX_ITERATIONS) {
      this.MAX_ITERATIONS =
        MAXIMUM_ATTEMPTS_PER_PROGRESS_STEP * this.inputRoute.route.length
    }
  }

  // Compute the path segments and their distances
  private computePathSegments() {
    let cumulativeDistance = 0

    for (let i = 0; i < this.inputRoute.route.length - 1; i++) {
      const start = this.inputRoute.route[i]
      const end = this.inputRoute.route[i + 1]

      // Calculate segment length using Euclidean distance
      const length =
        Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) + i / 10000

      this.pathSegments.push({
        start,
        end,
        length,
        startDistance: cumulativeDistance,
        endDistance: cumulativeDistance + length,
      })

      cumulativeDistance += length
    }

    this.totalPathLength = cumulativeDistance
  }

  // Helper to check if two points are the same
  private arePointsEqual(p1: Point, p2: Point): boolean {
    return p1.x === p2.x && p1.y === p2.y && p1.z === p2.z
  }

  // Get point at a specific distance along the path
  private getPointAtDistance(distance: number): Point {
    // Ensure distance is within bounds
    distance = Math.max(0, Math.min(distance, this.totalPathLength))

    // Find the segment that contains this distance
    const segment = this.pathSegments.find(
      (seg) => distance >= seg.startDistance && distance <= seg.endDistance,
    )

    if (!segment) {
      // Fallback to last point if segment not found
      return this.inputRoute.route[this.inputRoute.route.length - 1]
    }

    // Calculate interpolation factor (between 0 and 1)
    const factor = (distance - segment.startDistance) / segment.length

    // Interpolate the point
    return {
      x: segment.start.x + factor * (segment.end.x - segment.start.x),
      y: segment.start.y + factor * (segment.end.y - segment.start.y),
      z: factor < 0.5 ? segment.start.z : segment.end.z, // Z doesn't interpolate - use the segment's start z value
    }
  }

  // Find nearest index in the original route for a given distance
  private getNearestIndexForDistance(distance: number): number {
    if (distance <= 0) return 0
    if (distance >= this.totalPathLength)
      return this.inputRoute.route.length - 1

    // Find the segment that contains this distance
    const segmentIndex = this.pathSegments.findIndex(
      (seg) => distance >= seg.startDistance && distance <= seg.endDistance,
    )

    if (segmentIndex === -1) return 0

    // If closer to the end of the segment, return the next index
    const segment = this.pathSegments[segmentIndex]
    const midDistance = (segment.startDistance + segment.endDistance) / 2

    return distance > midDistance ? segmentIndex + 1 : segmentIndex
  }

  // Check if a path segment is valid
  isValidPathSegment(start: Point, end: Point): boolean {
    // Check if the segment intersects with any obstacle
    for (const obstacle of this.filteredObstacles) {
      if (!obstacle.__zLayers?.includes(start.z)) {
        continue
      }

      const distToObstacle = segmentToBoxMinDistance(start, end, obstacle)

      // Check if the line might intersect with this obstacle's borders
      if (
        distToObstacle <
        this.OBSTACLE_MARGIN + this.clearanceTraceThickness / 2
      ) {
        return false
      }
    }

    // Check if the segment intersects with any other route
    const segmentsThatCouldIntersect =
      this.segmentTree.getSegmentsThatCouldIntersect(start, end)
    for (const [otherSegA, otherSegB, segId] of segmentsThatCouldIntersect) {
      // Only check intersection if we're on the same layer
      if (otherSegA.z === start.z && otherSegB.z === start.z) {
        const distBetweenSegments = minimumDistanceBetweenSegments(
          { x: start.x, y: start.y },
          { x: end.x, y: end.y },
          { x: otherSegA.x, y: otherSegA.y },
          { x: otherSegB.x, y: otherSegB.y },
        )
        if (!this.useTraceWidthAwareClearance) {
          if (
            distBetweenSegments <
            this.OBSTACLE_MARGIN + this.TRACE_THICKNESS
          ) {
            return false
          }
          continue
        }
        const otherTraceThickness =
          this.traceThicknessByObstacleSegmentId.get(segId)
        if (otherTraceThickness === undefined) {
          throw new Error(`Missing trace thickness for segment "${segId}"`)
        }
        const requiredSeparation =
          this.OBSTACLE_MARGIN +
          this.clearanceTraceThickness / 2 +
          otherTraceThickness / 2
        if (distBetweenSegments < requiredSeparation) {
          return false
        }
      }
    }

    for (const via of this.filteredVias) {
      if (
        pointToSegmentDistance(via, start, end) <
        this.OBSTACLE_MARGIN +
          via.diameter / 2 +
          this.clearanceTraceThickness / 2
      ) {
        return false
      }
    }

    // Check if the segment intersects with any jumper pads
    for (const jumperPad of this.filteredJumperPads) {
      const distToJumperPad = segmentToBoxMinDistance(start, end, jumperPad)

      if (
        distToJumperPad <
        this.OBSTACLE_MARGIN + this.clearanceTraceThickness / 2
      ) {
        return false
      }
    }

    if (this.outline && this.outline.length >= 3) {
      const crossesOutline = doesSegmentCrossPolygonBoundary({
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        polygon: this.outline,
        margin: this.minBoardEdgeClearance + this.inputRoute.traceThickness / 2,
      })

      if (crossesOutline) {
        return false
      }
    }

    return true
  }

  // Check if a path with multiple points is valid
  isValidPath(pointsInRoute: Point[]): boolean {
    if (pointsInRoute.length < 2) return true

    // Check for layer changes - we don't allow simplifying across layer changes
    for (let i = 0; i < pointsInRoute.length - 1; i++) {
      if (pointsInRoute[i].z !== pointsInRoute[i + 1].z) {
        return false
      }
    }

    // Check each segment of the path
    for (let i = 0; i < pointsInRoute.length - 1; i++) {
      if (!this.isValidPathSegment(pointsInRoute[i], pointsInRoute[i + 1])) {
        return false
      }
    }

    return true
  }

  // Find a valid 45-degree path between two points
  private find45DegreePath(start: Point, end: Point): Point[] | null {
    // Skip if points are the same
    if (this.arePointsEqual(start, end)) {
      return [start]
    }

    // Skip 45-degree check if we're on different layers
    if (start.z !== end.z) {
      return null
    }

    // Calculate potential 45-degree paths
    const possiblePaths = calculate45DegreePaths(
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    )

    // Check each path for validity
    for (const path of possiblePaths) {
      // Convert the 2D points to 3D points with the correct z value
      const fullPath = path.map((p) => ({ x: p.x, y: p.y, z: start.z }))

      // Check if this path is valid
      if (this.isValidPath(fullPath)) {
        return fullPath
      }
    }

    // No valid 45-degree path found
    return null
  }

  // Add a path to the result, skipping the first point if it's already added
  private addPathToResult(path: Point[]) {
    if (path.length === 0) return

    for (let i = 0; i < path.length; i++) {
      // Skip the first point if it's already added
      if (
        i === 0 &&
        this.newRoute.length > 0 &&
        this.arePointsEqual(this.newRoute[this.newRoute.length - 1], path[i])
      ) {
        continue
      }
      this.newRoute.push(path[i])
    }
    this.currentStepSize = this.maxStepSize
  }

  private appendOriginalRouteSlice(
    startDistance: number,
    endIndexInclusive: number,
  ) {
    const startIndex = this.pathSegments.findIndex(
      (segment) =>
        startDistance >= segment.startDistance &&
        startDistance <= segment.endDistance,
    )
    if (startIndex === -1) {
      throw new Error(
        `Could not find path segment containing distance ${startDistance}`,
      )
    }

    for (
      let routeIndex = startIndex + 1;
      routeIndex <= endIndexInclusive &&
      routeIndex < this.inputRoute.route.length;
      routeIndex++
    ) {
      const originalPoint = this.inputRoute.route[routeIndex]
      const lastPointInNewRoute = this.newRoute[this.newRoute.length - 1]

      if (
        lastPointInNewRoute &&
        this.arePointsEqual(lastPointInNewRoute, originalPoint)
      ) {
        continue
      }

      this.newRoute.push({ ...originalPoint })
    }
  }

  moveHead(distance: number) {
    this.lastHeadMoveDistance = distance
    this.headDistanceAlongPath = Math.min(
      this.headDistanceAlongPath + distance,
      this.totalPathLength,
    )
  }

  stepBackAndReduceStepSize() {
    this.headDistanceAlongPath = Math.max(
      this.tailDistanceAlongPath,
      this.headDistanceAlongPath - this.lastHeadMoveDistance,
    )
    this.currentStepSize = Math.max(
      this.minStepSize,
      this.currentStepSize * this.STEP_SIZE_REDUCTION_FACTOR,
    )
  }

  _step() {
    const tailHasReachedEnd = this.tailDistanceAlongPath >= this.totalPathLength
    const headHasReachedEnd = this.headDistanceAlongPath >= this.totalPathLength

    if (tailHasReachedEnd) {
      // Make sure to add the last point if needed
      const lastPoint = this.inputRoute.route[this.inputRoute.route.length - 1]
      if (
        this.newRoute.length === 0 ||
        !this.arePointsEqual(this.newRoute[this.newRoute.length - 1], lastPoint)
      ) {
        // TODO find path from tail to end w/ 45 degree paths
        this.newRoute.push(lastPoint)
      }
      this.solved = true
      return
    }

    if (headHasReachedEnd) {
      const tailPoint = this.getPointAtDistance(this.tailDistanceAlongPath)
      const endPoint = this.inputRoute.route[this.inputRoute.route.length - 1]

      // Try to find a valid 45-degree path
      const path45 = this.find45DegreePath(tailPoint, endPoint)

      if (path45) {
        // Add the path to the result
        this.addPathToResult(path45)
        this.solved = true
        return
      }

      // No valid 45-degree path to the end. Keep any valid simplified prefix
      // and preserve only the remaining original tail to guarantee connectivity.
      const connectorStartDistance = this.lastValidPath
        ? this.lastValidPathHeadDistance
        : this.tailDistanceAlongPath

      if (this.lastValidPath) {
        this.addPathToResult(this.lastValidPath)
        this.lastValidPath = null
      }

      const startIndex = this.getNearestIndexForDistance(connectorStartDistance)
      this.appendOriginalRouteSlice(
        connectorStartDistance,
        this.inputRoute.route.length - 1,
      )

      this.tailDistanceAlongPath = this.totalPathLength
      this.headDistanceAlongPath = this.totalPathLength
      this.solved = true
      return
    }

    // Increment head distance but don't go past the end of the path
    this.moveHead(this.currentStepSize)

    // Get the points between tail and head distances
    const tailPoint = this.getPointAtDistance(this.tailDistanceAlongPath)
    const headPoint = this.getPointAtDistance(this.headDistanceAlongPath)

    // Check for layer changes between tail and head
    const tailIndex = this.getNearestIndexForDistance(
      this.tailDistanceAlongPath,
    )
    const headIndex = this.getNearestIndexForDistance(
      this.headDistanceAlongPath,
    )

    // If there's a potential layer change in this segment
    let layerChangeBtwHeadAndTail = false
    let layerChangeAtDistance = -1

    for (let i = tailIndex; i < headIndex; i++) {
      if (
        i + 1 < this.inputRoute.route.length &&
        this.inputRoute.route[i].z !== this.inputRoute.route[i + 1].z
      ) {
        layerChangeBtwHeadAndTail = true
        const changeSegmentIndex = i
        layerChangeAtDistance =
          this.pathSegments[changeSegmentIndex].startDistance
        break
      }
    }

    if (
      layerChangeBtwHeadAndTail &&
      this.lastHeadMoveDistance > this.minStepSize
    ) {
      this.stepBackAndReduceStepSize()
      return
    }

    // Check for jumper pad points between tail and head
    // These points must be preserved exactly like layer changes
    let jumperPadBtwHeadAndTail = false
    let jumperPadAtIndex = -1
    let jumperPadAtDistance = -1

    for (let i = tailIndex + 1; i <= headIndex; i++) {
      if (this.jumperPadPointIndices.has(i)) {
        jumperPadBtwHeadAndTail = true
        jumperPadAtIndex = i
        // Find the distance to this jumper pad point
        if (i > 0 && i - 1 < this.pathSegments.length) {
          jumperPadAtDistance = this.pathSegments[i - 1].endDistance
        } else {
          jumperPadAtDistance = this.pathSegments[0]?.startDistance ?? 0
        }
        break
      }
    }

    if (
      jumperPadBtwHeadAndTail &&
      this.lastHeadMoveDistance > this.minStepSize
    ) {
      this.stepBackAndReduceStepSize()
      return
    }

    // If there's a jumper pad point, handle it (force stop at the pad)
    if (jumperPadBtwHeadAndTail && jumperPadAtIndex >= 0) {
      const jumperPadPoint = this.inputRoute.route[jumperPadAtIndex]

      // 1. Add the last valid path found *before* the jumper pad.
      if (this.lastValidPath) {
        this.addPathToResult(this.lastValidPath)
        this.lastValidPath = null
      }

      // 2. Ensure the route connects *exactly* to the jumper pad location
      const lastPointInNewRoute = this.newRoute[this.newRoute.length - 1]
      if (
        !lastPointInNewRoute ||
        lastPointInNewRoute.x !== jumperPadPoint.x ||
        lastPointInNewRoute.y !== jumperPadPoint.y
      ) {
        // Add the jumper pad point explicitly
        this.newRoute.push({
          x: jumperPadPoint.x,
          y: jumperPadPoint.y,
          z: jumperPadPoint.z,
        })
      }

      // 3. Reset state for the next segment (after the jumper pad)
      this.currentStepSize = this.maxStepSize
      this.tailDistanceAlongPath = jumperPadAtDistance
      this.headDistanceAlongPath = this.tailDistanceAlongPath
      this.lastValidPath = null
      this.lastValidPathHeadDistance = this.tailDistanceAlongPath

      return
    }

    // If there's a layer change, handle it
    // Inside the _step method, within the layer change handling block:
    if (layerChangeBtwHeadAndTail && layerChangeAtDistance > 0) {
      const connectorStartDistance = this.lastValidPath
        ? this.lastValidPathHeadDistance
        : this.tailDistanceAlongPath
      // Get the point *after* the layer change from the original route.
      // This point's XY coordinates define the via location.
      const indexAfterLayerChange =
        this.getNearestIndexForDistance(layerChangeAtDistance) + 1
      const pointAfterChange = this.inputRoute.route[indexAfterLayerChange]
      const viaLocation = { x: pointAfterChange.x, y: pointAfterChange.y }

      // 1. Add the last valid path found *before* the layer change.
      if (this.lastValidPath) {
        this.addPathToResult(this.lastValidPath)
        this.lastValidPath = null // Clear it after adding
      }

      // 2. Reach the via on the current layer without introducing an
      // unchecked shortcut. If a direct 45-degree path is illegal, preserve
      // the original geometry up to the via.
      const lastPointInNewRoute = this.newRoute[this.newRoute.length - 1]
      const viaPointOnLeavingLayer = {
        x: viaLocation.x,
        y: viaLocation.y,
        z: lastPointInNewRoute.z,
      }

      if (!this.arePointsEqual(lastPointInNewRoute, viaPointOnLeavingLayer)) {
        const pathToVia = this.find45DegreePath(
          lastPointInNewRoute,
          viaPointOnLeavingLayer,
        )

        if (pathToVia) {
          this.addPathToResult(pathToVia)
        } else {
          this.appendOriginalRouteSlice(
            connectorStartDistance,
            indexAfterLayerChange - 1,
          )
        }
      }

      // 3. Add the via itself.
      this.newVias.push(viaLocation)

      // 4. Add the point *after* the layer change, starting the segment on the *new* layer.
      // Ensure this point also uses the precise via location and the *new* Z coordinate.
      this.newRoute.push({
        x: viaLocation.x,
        y: viaLocation.y,
        z: pointAfterChange.z, // Use the Z of the layer we are entering
      })

      // 5. Reset state for the next segment.
      this.currentStepSize = this.maxStepSize

      // Update tail to the start of the segment *after* the layer change point
      const segmentIndexAfterChange = this.pathSegments.findIndex(
        (seg) => seg.start === pointAfterChange,
      )

      if (segmentIndexAfterChange !== -1) {
        this.tailDistanceAlongPath =
          this.pathSegments[segmentIndexAfterChange].startDistance
        this.headDistanceAlongPath = this.tailDistanceAlongPath // Reset head to tail
        this.lastValidPath = null // Ensure lastValidPath is clear
        this.lastValidPathHeadDistance = this.tailDistanceAlongPath
      } else if (indexAfterLayerChange < this.inputRoute.route.length) {
        // Check if it's the last point - if so, we are done as there are no more segments
        if (indexAfterLayerChange === this.inputRoute.route.length - 1) {
          this.solved = true
          return
        }

        // Fallback if the exact segment wasn't found but index is valid
        // This might happen due to floating point comparisons if getPointAtDistance was used previously
        console.warn(
          "Fallback used for tailDistanceAlongPath after layer change",
        )
        const segment = this.pathSegments.find(
          (seg) => seg.start === this.inputRoute.route[indexAfterLayerChange],
        )
        if (segment) {
          this.tailDistanceAlongPath = segment.startDistance
          this.headDistanceAlongPath = this.tailDistanceAlongPath
          this.lastValidPath = null
          this.lastValidPathHeadDistance = this.tailDistanceAlongPath
        } else {
          console.error(
            `[${this.inputRoute.connectionName}] Could not find segment start after layer change. Path might be incomplete.
            Index sought: ${indexAfterLayerChange}, Point: (${this.inputRoute.route[indexAfterLayerChange].x.toFixed(3)}, ${this.inputRoute.route[indexAfterLayerChange].y.toFixed(3)}, z=${this.inputRoute.route[indexAfterLayerChange].z})
            Route Length: ${this.inputRoute.route.length}, Path Segments: ${this.pathSegments.length}`,
          )
          this.solved = true // Prevent infinite loop
        }
      } else {
        // Layer change occurred at the very last point/segment.
        console.warn("Layer change occurred at the end of the path.")
        // The last point on the new layer is already added. We are done.
        this.solved = true
      }

      return // End the step after handling the layer change
    }

    // Try to find a valid 45-degree path from tail to head
    const path45 = this.find45DegreePath(tailPoint, headPoint)

    if (!path45 && this.lastHeadMoveDistance > this.minStepSize) {
      this.stepBackAndReduceStepSize()
      return
    }

    if (!path45 && !this.lastValidPath) {
      const oldTailPoint = this.getPointAtDistance(this.tailDistanceAlongPath)

      // Move tail and head forward by stepSize
      this.tailDistanceAlongPath += this.minStepSize
      this.moveHead(this.minStepSize)

      const newTailIndex = this.getNearestIndexForDistance(
        this.tailDistanceAlongPath,
      )
      const newTailPoint = this.inputRoute.route[newTailIndex]
      const lastRoutePoint =
        this.inputRoute.route[this.inputRoute.route.length - 1]

      // Add the segment from old tail to new tail
      if (
        !this.arePointsEqual(oldTailPoint, newTailPoint) &&
        !this.arePointsEqual(newTailPoint, lastRoutePoint)
      ) {
        this.newRoute.push(newTailPoint)
        // Start the next validated path at the vertex appended above.
        this.tailDistanceAlongPath =
          newTailIndex === 0
            ? 0
            : this.pathSegments[newTailIndex - 1].endDistance
        if (this.headDistanceAlongPath < this.tailDistanceAlongPath) {
          this.headDistanceAlongPath = this.tailDistanceAlongPath
        }
      }

      return
    }

    if (path45) {
      // Valid 45-degree path found, store it and continue expanding
      this.lastValidPath = path45
      this.lastValidPathHeadDistance = this.headDistanceAlongPath
      return
    }

    // No valid path found, use the last valid path and reset
    if (this.lastValidPath) {
      this.addPathToResult(this.lastValidPath)
      this.lastValidPath = null
      this.tailDistanceAlongPath = this.lastValidPathHeadDistance
      this.moveHead(this.minStepSize)
    }
  }

  visualize(): GraphicsObject {
    const graphics = this.getVisualsForNewRouteAndObstacles()

    // Highlight current head and tail positions
    const tailPoint = this.getPointAtDistance(this.tailDistanceAlongPath)
    const headPoint = this.getPointAtDistance(this.headDistanceAlongPath)

    graphics.points.push({
      x: tailPoint.x,
      y: tailPoint.y,
      color: "yellow",
      label: ["Tail", `z: ${tailPoint.z}`].join("\n"),
    })

    graphics.points.push({
      x: headPoint.x,
      y: headPoint.y,
      color: "orange",
      label: ["Head", `z: ${headPoint.z}`].join("\n"),
    })

    const tentativeHead = this.getPointAtDistance(
      this.headDistanceAlongPath + this.currentStepSize,
    )
    graphics.points.push({
      x: tentativeHead.x,
      y: tentativeHead.y,
      color: "red",
      label: ["Tentative Head", `z: ${tentativeHead.z}`].join("\n"),
    })

    // Add visualization of the path segments
    let distance = 0
    while (distance < this.totalPathLength) {
      const point = this.getPointAtDistance(distance)
      graphics.circles.push({
        center: {
          x: point.x,
          y: point.y,
        },
        radius: 0.05,
        fill: "rgba(100, 100, 100, 0.5)",
      })
      distance += this.totalPathLength / 20 // Show 20 markers along the path
    }

    // Visualize the current prospective 45-degree path from tail to head
    if (this.lastValidPath && this.lastValidPath.length > 1) {
      // Draw the path in a bright cyan color to make it stand out
      for (let i = 0; i < this.lastValidPath.length - 1; i++) {
        graphics.lines.push({
          points: [
            { x: this.lastValidPath[i].x, y: this.lastValidPath[i].y },
            {
              x: this.lastValidPath[i + 1].x,
              y: this.lastValidPath[i + 1].y,
            },
          ],
          strokeColor: "rgba(0, 255, 255, 0.9)", // Bright cyan
          strokeDash: "3, 3", // Dashed line to indicate it's a prospective path
        })
      }
    }

    return graphics
  }
}
