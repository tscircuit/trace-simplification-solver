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
import type { PathSimplificationGeometryIndex } from "../../data-structures/PathSimplificationGeometryIndex"

type Point = HighDensityIntraNodeRoute["route"][number]

interface PathAnchor {
  beforeIndex: number
  afterIndex: number
}

interface PathSegment {
  start: Point
  end: Point
  length: number
  startDistance: number
  endDistance: number
}

export class SingleSimplifiedPathSolver5 extends SingleSimplifiedPathSolver {
  private pathSegments: PathSegment[] = []
  private sourcePointDistances: number[] = [0]
  private pathAnchors: PathAnchor[] = []
  private nextAnchorIndex = 0
  private sourcePointIndex = 0
  private lastOutputSourceIndex = 0
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
      geometryQuery?: {
        index: PathSimplificationGeometryIndex
        routeIndex: number
      }
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
      ? Math.max(
          0,
          ...this.otherHdRoutes.flatMap((route) => [
            route.traceThickness,
            ...route.route.map(
              (point) => point.traceThickness ?? route.traceThickness,
            ),
          ]),
        )
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

    const obstacleMargin =
      this.OBSTACLE_MARGIN + this.clearanceTraceThickness / 2
    const candidateObstacles = params.geometryQuery
      ? params.geometryQuery.index.getCandidateObstacles(
          {
            minX: boundsBox.center.x - boundsBox.width / 2,
            minY: boundsBox.center.y - boundsBox.height / 2,
            maxX: boundsBox.center.x + boundsBox.width / 2,
            maxY: boundsBox.center.y + boundsBox.height / 2,
          },
          obstacleMargin,
        )
      : this.obstacles
    const candidateRoutes = params.geometryQuery
      ? params.geometryQuery.index.getCandidateRoutes(
          bounds,
          Math.max(routeSegmentMargin, obstacleMargin),
          params.geometryQuery.routeIndex,
        )
      : this.otherHdRoutes

    this.filteredObstacles = candidateObstacles
      .filter(
        (obstacle) =>
          !obstacle.connectedTo.some((id) =>
            this.connMap.areIdsConnected(this.inputRoute.connectionName, id),
          ),
      )
      .filter((obstacle) => {
        if (
          obstacle.connectedTo.some((obsId) =>
            this.connMap.areIdsConnected(this.inputRoute.connectionName, obsId),
          )
        ) {
          return false
        }

        const distance = computeGapBetweenBoxes(boundsBox, obstacle)

        if (
          distance <
          this.OBSTACLE_MARGIN + this.clearanceTraceThickness / 2
        ) {
          return true
        }

        return false
      })

    this.filteredObstaclePathSegments = candidateRoutes.flatMap((hdRoute) => {
      if (this.isSameNetRoute(hdRoute)) {
        return []
      }

      const route = hdRoute.route
      const segments: Array<[Point, Point]> = []
      for (let i = 0; i < route.length - 1; i++) {
        const start = route[i]
        const end = route[i + 1]

        if (
          segmentToBoundsMinDistance(start, end, bounds) <= routeSegmentMargin
        ) {
          segments.push([start, end])
          const segmentId = `${start.x}-${start.y}-${start.z}-${end.x}-${end.y}-${end.z}`
          if (this.useTraceWidthAwareClearance) {
            const segmentTraceThickness = Math.max(
              start.traceThickness ?? hdRoute.traceThickness,
              end.traceThickness ?? hdRoute.traceThickness,
            )
            this.traceThicknessByObstacleSegmentId.set(
              segmentId,
              Math.max(
                this.traceThicknessByObstacleSegmentId.get(segmentId) ?? 0,
                segmentTraceThickness,
              ),
            )
          }
        }
      }

      return segments
    })
    this.segmentTree = this.useTraceWidthAwareClearance
      ? new SegmentTree(this.filteredObstaclePathSegments, routeSegmentMargin)
      : new SegmentTree(this.filteredObstaclePathSegments)

    this.filteredVias = candidateRoutes.flatMap((hdRoute) => {
      if (this.isSameNetRoute(hdRoute)) {
        return []
      }

      const vias = hdRoute.vias
      const filteredVias: Array<{ x: number; y: number; diameter: number }> = []
      for (const via of vias) {
        const margin =
          this.OBSTACLE_MARGIN +
          this.clearanceTraceThickness / 2 +
          hdRoute.viaDiameter / 2
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
          filteredVias.push({ ...via, diameter: hdRoute.viaDiameter })
        }
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
    this.filteredJumperPads = candidateRoutes.flatMap((hdRoute) => {
      if (this.isSameNetRoute(hdRoute)) {
        return []
      }

      return extractJumperPads(hdRoute.jumpers ?? [], hdRoute.connectionName)
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
  }

  // Compute the path segments and their distances
  private computePathSegments() {
    let cumulativeDistance = 0

    for (let i = 0; i < this.inputRoute.route.length - 1; i++) {
      const start = this.inputRoute.route[i]
      const end = this.inputRoute.route[i + 1]

      // Calculate segment length using Euclidean distance
      const length = Math.hypot(end.x - start.x, end.y - start.y)

      this.pathSegments.push({
        start,
        end,
        length,
        startDistance: cumulativeDistance,
        endDistance: cumulativeDistance + length,
      })

      cumulativeDistance += length
      this.sourcePointDistances.push(cumulativeDistance)
    }

    const protectedPoints = this.inputRoute.route.map(
      (point, index): boolean => {
        const width = point.traceThickness ?? this.inputRoute.traceThickness
        const previous = this.inputRoute.route[index - 1]
        const next = this.inputRoute.route[index + 1]
        return (
          Object.keys(point).some(
            (key) =>
              key !== "x" &&
              key !== "y" &&
              key !== "z" &&
              key !== "traceThickness",
          ) ||
          (previous !== undefined &&
            (previous.traceThickness ?? this.inputRoute.traceThickness) !==
              width) ||
          (next !== undefined &&
            (next.traceThickness ?? this.inputRoute.traceThickness) !== width)
        )
      },
    )
    // Source order, rather than invented distance, distinguishes events at
    // the same position: duplicate vertices, vias and protected copper edges.
    for (let index = 0; index < this.inputRoute.route.length; index++) {
      const point = this.inputRoute.route[index]
      if (
        index === this.inputRoute.route.length - 1 ||
        this.jumperPadPointIndices.has(index) ||
        protectedPoints[index]
      )
        this.pathAnchors.push({ beforeIndex: index, afterIndex: index })
      const segment = this.pathSegments[index]
      if (
        segment &&
        ((segment.length === 0 &&
          (protectedPoints[index] || protectedPoints[index + 1])) ||
          segment.start.z !== segment.end.z ||
          segment.start.toNextSegmentType ||
          segment.start.insideJumperPad ||
          segment.end.insideJumperPad)
      )
        this.pathAnchors.push({ beforeIndex: index, afterIndex: index + 1 })
    }
    this.totalPathLength = cumulativeDistance
  }

  // Helper to check if two points are the same
  private arePointsEqual(p1: Point, p2: Point): boolean {
    return p1.x === p2.x && p1.y === p2.y && p1.z === p2.z
  }

  // Equal-distance source events are consumed separately from interpolation.
  private getPointAtDistance(distance: number): Point {
    const anchor = this.pathAnchors[this.nextAnchorIndex]
    const endIndex = anchor?.beforeIndex ?? this.inputRoute.route.length - 1
    const sectionEnd = this.sourcePointDistances[endIndex]
    if (distance >= sectionEnd) return this.inputRoute.route[endIndex]
    const segment = this.pathSegments.find(
      (segment, index) =>
        index >= this.sourcePointIndex &&
        index < endIndex &&
        segment.length > 0 &&
        distance >= segment.startDistance &&
        distance <= segment.endDistance,
    )
    if (!segment)
      throw new Error(`No planar segment contains path distance ${distance}`)
    const factor = (distance - segment.startDistance) / segment.length
    return {
      x: segment.start.x + factor * (segment.end.x - segment.start.x),
      y: segment.start.y + factor * (segment.end.y - segment.start.y),
      z: segment.start.z,
      ...(segment.start.traceThickness !== undefined
        ? { traceThickness: segment.start.traceThickness }
        : {}),
    }
  }

  private getNearestIndexForDistance(distance: number): number {
    const anchor = this.pathAnchors[this.nextAnchorIndex]
    const endIndex = anchor?.beforeIndex ?? this.inputRoute.route.length - 1
    if (distance >= this.sourcePointDistances[endIndex]) return endIndex
    for (let index = this.sourcePointIndex; index < endIndex; index++) {
      const segment = this.pathSegments[index]
      if (segment.length === 0 || distance > segment.endDistance) continue
      return distance > (segment.startDistance + segment.endDistance) / 2
        ? index + 1
        : index
    }
    throw new Error(`No source vertex contains path distance ${distance}`)
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
      const fullPath = path.map((p) => ({
        x: p.x,
        y: p.y,
        z: start.z,
        ...(start.traceThickness !== undefined
          ? { traceThickness: start.traceThickness }
          : {}),
      }))

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
      this.lastOutputSourceIndex = -1
    }
    this.currentStepSize = this.maxStepSize
  }

  private appendSourcePoint(sourceIndex: number): void {
    if (this.lastOutputSourceIndex === sourceIndex) return
    const sourcePoint = this.inputRoute.route[sourceIndex]
    const last = this.newRoute[this.newRoute.length - 1]
    // Identical plain vertices carry no event. Their source indices still
    // advance, while metadata-bearing duplicates retain their exact ordering.
    if (
      sourceIndex !== this.inputRoute.route.length - 1 &&
      last &&
      this.arePointsEqual(last, sourcePoint) &&
      [last, sourcePoint].every((point) =>
        Object.keys(point).every(
          (key) => key === "x" || key === "y" || key === "z",
        ),
      )
    ) {
      this.lastOutputSourceIndex = sourceIndex
      return
    }
    if (
      this.lastOutputSourceIndex === -1 &&
      last &&
      this.arePointsEqual(last, sourcePoint)
    ) {
      this.newRoute[this.newRoute.length - 1] = { ...sourcePoint }
    } else this.newRoute.push({ ...sourcePoint })
    this.lastOutputSourceIndex = sourceIndex
  }

  private appendOriginalRouteSlice(
    startDistance: number,
    endIndexInclusive: number,
  ): void {
    let startIndex = this.sourcePointIndex
    while (
      startIndex < endIndexInclusive &&
      this.pathSegments[startIndex].endDistance <= startDistance
    )
      startIndex++
    for (let index = startIndex + 1; index <= endIndexInclusive; index++) {
      this.appendSourcePoint(index)
    }
  }

  private finishPlanarSection(endIndex: number): void {
    const endPoint = this.inputRoute.route[endIndex]
    const tailPoint = this.getPointAtDistance(this.tailDistanceAlongPath)
    const path = this.find45DegreePath(tailPoint, endPoint)
    if (path) this.addPathToResult(path)
    else {
      const connectorStart = this.lastValidPath
        ? this.lastValidPathHeadDistance
        : this.tailDistanceAlongPath
      if (this.lastValidPath) this.addPathToResult(this.lastValidPath)
      this.appendOriginalRouteSlice(connectorStart, endIndex)
    }
    this.appendSourcePoint(endIndex)
    this.lastValidPath = null
  }

  private consumeAnchor(anchor: PathAnchor): void {
    this.finishPlanarSection(anchor.beforeIndex)
    const before = this.inputRoute.route[anchor.beforeIndex]
    const after = this.inputRoute.route[anchor.afterIndex]
    if (
      before.z !== after.z &&
      before.toNextSegmentType !== "through_obstacle"
    ) {
      const viaAtStart =
        this.inputRoute.vias.some(
          (via) => via.x === before.x && via.y === before.y,
        ) &&
        !this.inputRoute.vias.some(
          (via) => via.x === after.x && via.y === after.y,
        )
      const viaPoint = viaAtStart ? before : after
      if (before.x !== after.x || before.y !== after.y) {
        this.newRoute.push({
          x: viaPoint.x,
          y: viaPoint.y,
          z: viaAtStart ? after.z : before.z,
        })
        this.lastOutputSourceIndex = -1
      }
      if (
        !this.newVias.some(
          (via) => via.x === viaPoint.x && via.y === viaPoint.y,
        )
      ) {
        this.newVias.push({ x: viaPoint.x, y: viaPoint.y })
      }
    }
    this.appendSourcePoint(anchor.afterIndex)
    this.sourcePointIndex = anchor.afterIndex
    this.nextAnchorIndex++
    this.tailDistanceAlongPath = this.sourcePointDistances[anchor.afterIndex]
    this.headDistanceAlongPath = this.tailDistanceAlongPath
    this.lastValidPathHeadDistance = this.tailDistanceAlongPath
    this.currentStepSize = this.maxStepSize
  }

  moveHead(distance: number): void {
    const anchor = this.pathAnchors[this.nextAnchorIndex]
    const sectionEnd = anchor
      ? this.sourcePointDistances[anchor.beforeIndex]
      : this.totalPathLength
    // Keep the requested minimum step exact: subtracting rounded coordinates
    // can turn 0.25 into 0.2500000000000018 and retry that step forever.
    this.lastHeadMoveDistance = Math.min(
      distance,
      sectionEnd - this.headDistanceAlongPath,
    )
    this.headDistanceAlongPath = Math.min(
      this.headDistanceAlongPath + this.lastHeadMoveDistance,
      sectionEnd,
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

  _step(): void {
    // Drain equal-arclength events before checking completion, including an
    // initial/terminal via or a route whose entire geometric length is zero.
    let anchor = this.pathAnchors[this.nextAnchorIndex]
    while (
      anchor &&
      this.sourcePointDistances[anchor.beforeIndex] <=
        this.tailDistanceAlongPath
    ) {
      this.consumeAnchor(anchor)
      anchor = this.pathAnchors[this.nextAnchorIndex]
    }
    if (this.tailDistanceAlongPath >= this.totalPathLength && !anchor) {
      this.appendSourcePoint(this.inputRoute.route.length - 1)
      this.solved = true
      return
    }
    const sectionEnd = anchor
      ? this.sourcePointDistances[anchor.beforeIndex]
      : this.totalPathLength
    if (this.headDistanceAlongPath >= sectionEnd) {
      if (anchor) this.consumeAnchor(anchor)
      else {
        this.finishPlanarSection(this.inputRoute.route.length - 1)
        this.solved = true
      }
      return
    }
    this.moveHead(this.currentStepSize)
    const tailPoint = this.getPointAtDistance(this.tailDistanceAlongPath)
    const headPoint = this.getPointAtDistance(this.headDistanceAlongPath)
    const path45 = this.find45DegreePath(tailPoint, headPoint)
    if (!path45 && this.lastHeadMoveDistance > this.minStepSize) {
      this.stepBackAndReduceStepSize()
      return
    }
    if (!path45 && !this.lastValidPath) {
      const targetDistance = Math.min(
        this.tailDistanceAlongPath + this.minStepSize,
        sectionEnd,
      )
      const endIndex = anchor?.beforeIndex ?? this.inputRoute.route.length - 1
      let sourceIndex = this.getNearestIndexForDistance(targetDistance)
      while (
        sourceIndex < endIndex &&
        this.sourcePointDistances[sourceIndex] <= this.tailDistanceAlongPath
      )
        sourceIndex++
      this.appendOriginalRouteSlice(this.tailDistanceAlongPath, sourceIndex)
      this.sourcePointIndex = sourceIndex
      this.tailDistanceAlongPath = this.sourcePointDistances[sourceIndex]
      this.headDistanceAlongPath = Math.max(
        this.headDistanceAlongPath,
        this.tailDistanceAlongPath,
      )
      return
    }
    if (path45) {
      this.lastValidPath = path45
      this.lastValidPathHeadDistance = this.headDistanceAlongPath
      return
    }
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
