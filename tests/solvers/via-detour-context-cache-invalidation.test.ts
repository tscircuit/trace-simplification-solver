import { expect, test } from "bun:test"
import {
  HighDensityRouteSpatialIndex,
  ObstacleSpatialHashIndex,
  SingleRouteUselessViaRemovalSolver,
} from "../../index"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("detour context is reused within a section and cleared after copper changes", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: -1, y: 0, z: 0 },
      { x: -1, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
    ],
    vias: [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ],
  }
  const blocker: HighDensityRoute = {
    connectionName: "blocker",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: -0.2, z: 0 },
      { x: 0, y: 0.2, z: 0 },
    ],
    vias: [],
  }
  const index = new HighDensityRouteSpatialIndex([route, blocker])
  const originalQuery = index.getConflictingRoutesForSegment.bind(index)
  let queries = 0
  index.getConflictingRoutesForSegment = (...args) => {
    queries++
    return originalQuery(...args)
  }
  const solver = new SingleRouteUselessViaRemovalSolver({
    obstacleSHI: new ObstacleSpatialHashIndex("flatbush", []),
    hdRouteSHI: index,
    unsimplifiedRoute: route,
    connMap: new ConnectivityMap({ signal: ["signal"], blocker: ["blocker"] }),
    enableGeometryShortcuts: false,
    enableObstacleDetourShortcuts: true,
    enableRoutedTraceDetours: true,
    preserveRouteEndpoints: true,
  })
  const methods = solver as unknown as {
    getObstacleDetourContext: (
      start: HighDensityRoute["route"][number],
      end: HighDensityRoute["route"][number],
      layer: number,
    ) => { traceCorners: Array<{ x: number; y: number }> }
  }
  queries = 0
  const start = solver.routeSections[0].points[0]
  const end = solver.routeSections[2].points[0]
  const before = methods.getObstacleDetourContext(start, end, 0)
  expect(before.traceCorners).toHaveLength(4)
  expect(methods.getObstacleDetourContext(start, end, 0)).toBe(before)
  expect(queries).toBe(1)
  index.addRoute({
    ...blocker,
    connectionName: "second_blocker",
    route: [
      { x: 0.5, y: -0.2, z: 0 },
      { x: 0.5, y: 0.2, z: 0 },
    ],
  })
  solver.step()
  solver.step()
  expect(
    methods.getObstacleDetourContext(start, end, 0).traceCorners,
  ).toHaveLength(8)
  expect(queries).toBeGreaterThan(1)
})
