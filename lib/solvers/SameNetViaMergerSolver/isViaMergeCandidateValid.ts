import {
  pointToSegmentDistance,
  segmentToBoxMinDistance,
} from "@tscircuit/math-utils"
import type { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { HighDensityRouteSpatialIndex } from "../../data-structures/HighDensityRouteSpatialIndex"
import type { Obstacle } from "../../types"
import type { HighDensityRoute } from "../../types/high-density-types"
import { minimumDistanceBetweenSegments } from "../../utils/minimumDistanceBetweenSegments"
import { doesSegmentCrossPolygonBoundary } from "../../utils/polygonContainment"
import { getViaTransitionPointIndices } from "./getViaTransitionPointIndices"
import type { SameNetViaMergerSolverInput } from "./SameNetViaMergerSolver"

type Point = HighDensityRoute["route"][number]
type CopperChange = {
  before: [Point, Point]
  after: [Point, Point]
  radius: number
  wire: boolean
}

const obstacleDistance = (a: Point, b: Point, obstacle: Obstacle): number => {
  if (obstacle.shape === "circle") {
    return pointToSegmentDistance(obstacle.center, a, b) - obstacle.width / 2
  }
  const radians = ((obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
  const cosine = Math.cos(radians),
    sine = Math.sin(radians)
  const [start, end] = [a, b].map((point) => ({
    x:
      (point.x - obstacle.center.x) * cosine +
      (point.y - obstacle.center.y) * sine,
    y:
      -(point.x - obstacle.center.x) * sine +
      (point.y - obstacle.center.y) * cosine,
  }))
  return segmentToBoxMinDistance(start!, end!, {
    ...obstacle,
    center: { x: 0, y: 0 },
  })
}

const touchesRoute = (
  a: Point,
  b: Point,
  radius: number,
  route: HighDensityRoute,
): boolean => {
  for (let i = 1; i < route.route.length; i++) {
    const c = route.route[i - 1]!,
      d = route.route[i]!
    if (c.z !== a.z || d.z !== a.z || (c.insideJumperPad && d.insideJumperPad))
      continue
    const wireRadius =
      Math.max(
        c.traceThickness ?? route.traceThickness,
        d.traceThickness ?? route.traceThickness,
      ) / 2
    if (
      minimumDistanceBetweenSegments(a, b, c, d) <=
      radius + wireRadius + 1e-8
    )
      return true
  }
  return route.vias.some(
    (via) =>
      pointToSegmentDistance(via, a, b) <=
      radius + route.viaDiameter / 2 + 1e-8,
  )
}

/** Check completed geometry once: changed copper must be clear and keep its contacts. */
export const isViaMergeCandidateValid = ({
  previous,
  routes,
  fixedRoutes,
  netByName,
  index,
  obstacles,
  connMap,
  layerCount,
  constraints,
  outline,
}: {
  previous: HighDensityRoute[]
  routes: HighDensityRoute[]
  fixedRoutes: ReadonlyArray<HighDensityRoute>
  netByName: ReadonlyMap<string, string | undefined>
  index: HighDensityRouteSpatialIndex
  obstacles: Obstacle[]
  connMap: ConnectivityMap
  layerCount: number
  constraints: NonNullable<SameNetViaMergerSolverInput["clearanceConstraints"]>
  outline: SameNetViaMergerSolverInput["outline"]
}): boolean => {
  const beforeRoutes = [...previous, ...fixedRoutes]
  const afterRoutes = [...routes, ...fixedRoutes]
  for (let ri = 0; ri < previous.length; ri++) {
    const original = previous[ri]!,
      candidate = routes[ri]!
    if (original === candidate) continue
    const net = netByName.get(original.connectionName)
    if (!net)
      throw new Error(
        `Missing net for via merge route "${original.connectionName}"`,
      )
    const changes: CopperChange[] = []
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
      changes.push({
        before: [a, b],
        after: [c, d],
        wire: true,
        radius:
          Math.max(
            a.traceThickness ?? original.traceThickness,
            b.traceThickness ?? original.traceThickness,
          ) / 2,
      })
    }
    // Equal-diameter occupied targets add no via copper. Removed barrels can
    // still be the sole contact to a branch on any board layer.
    for (const via of original.vias) {
      if (candidate.vias.some((v) => v.x === via.x && v.y === via.y)) continue
      const pointIndex = getViaTransitionPointIndices(original, via)
        .values()
        .next().value!
      const destination = candidate.route[pointIndex]!
      for (let z = 0; z < layerCount; z++) {
        const a = { ...via, z },
          b = { ...destination, z }
        changes.push({
          before: [a, a],
          after: [b, b],
          radius: original.viaDiameter / 2,
          wire: false,
        })
      }
    }
    for (const {
      before: [a, b],
      after: [c, d],
      radius,
      wire,
    } of changes) {
      if (
        wire &&
        index
          .getConflictingRoutesForSegment(
            c,
            d,
            radius + constraints.traceMargin,
          )
          .some(
            ({ conflictingRoute }) =>
              netByName.get(conflictingRoute.connectionName) !== net,
          )
      )
        return false
      if (
        wire &&
        outline &&
        (doesSegmentCrossPolygonBoundary({
          start: c,
          end: d,
          polygon: outline,
          margin: 0,
        }) ||
          outline.some(
            (point, i) =>
              minimumDistanceBetweenSegments(
                c,
                d,
                point,
                outline[(i + 1) % outline.length]!,
              ) <
              radius + (constraints.boardEdgeMargin ?? 0),
          ))
      )
        return false
      // Compare actual copper contact, including widths, rather than logical
      // net membership. A same-net branch is not automatically still connected.
      if (
        beforeRoutes.some(
          (other, index) =>
            index !== ri &&
            netByName.get(other.connectionName) === net &&
            touchesRoute(a, b, radius, other) &&
            !touchesRoute(c, d, radius, afterRoutes[index]!),
        )
      )
        return false
      for (const obstacle of obstacles) {
        if (!obstacle.__zLayers)
          throw new Error("Via merge obstacle has no zLayers")
        if (!obstacle.__zLayers.includes(c.z)) continue
        const sameNet = obstacle.connectedTo.some(
          (id) =>
            id === net ||
            connMap.idToNetMap[id] === net ||
            connMap.areIdsConnected(id, net),
        )
        const distance = obstacleDistance(c, d, obstacle)
        if (sameNet) {
          if (
            obstacleDistance(a, b, obstacle) <= radius + 1e-8 &&
            distance > radius + 1e-8
          )
            return false
        } else if (wire && distance < radius + constraints.obstacleMargin)
          return false
      }
    }
  }
  return true
}
