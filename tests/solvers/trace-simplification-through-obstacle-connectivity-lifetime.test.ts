import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"
import type { Obstacle } from "lib/types"

test("through-obstacle marking preserves obstacle order and refreshes connectivity between calls", () => {
  const obstacle = (
    id: string,
    layers: string[],
    connectedTo: string[],
  ): Obstacle => ({
    type: "rect",
    layers,
    connectedTo,
    center: { x: 0, y: 0 },
    width: 2,
    height: 2,
    circuitJsonMetadata: { pcb_plated_hole_id: id },
  })
  const obstacles = [
    obstacle("single-layer", ["top"], ["pad"]),
    obstacle("new-first-match", ["top", "bottom"], ["new-pad"]),
    obstacle("first-match", ["top", "bottom"], ["pad"]),
    obstacle("second-match", ["top", "bottom"], ["pad"]),
  ]
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      {
        x: 0,
        y: 0,
        z: 1,
        toNextSegmentType: "through_obstacle",
        toNextSegmentCircuitJsonMetadata: { pcb_plated_hole_id: "stale" },
      },
      {
        x: 2,
        y: 0,
        z: 1,
        toNextSegmentType: "through_obstacle",
        toNextSegmentCircuitJsonMetadata: { pcb_plated_hole_id: "stale" },
      },
    ],
    vias: [
      { x: 0, y: 0 },
      // The obstacle edge includes the existing 1e-6 tolerance.
      { x: 1.0000005, y: 0 },
      { x: 1.000002, y: 0 },
      { x: 2, y: 0 },
    ],
  }
  const originalRoute = structuredClone(route)
  const originalObstacles = structuredClone(obstacles)
  const connMap = new ConnectivityMap({ net: ["signal", "pad"] })
  const solver = new TraceSimplificationSolver({
    hdRoutes: [],
    obstacles,
    connMap,
    colorMap: {},
    defaultViaDiameter: 0.3,
    layerCount: 2,
  })

  const [first] = solver.markThroughObstacleSegments([route])
  expect(first!.route).toEqual([
    {
      x: 0,
      y: 0,
      z: 0,
      toNextSegmentType: "through_obstacle",
      toNextSegmentCircuitJsonMetadata: { pcb_plated_hole_id: "first-match" },
    },
    { x: 0, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
  ])
  expect(first!.vias).toEqual([
    { x: 1.000002, y: 0 },
    { x: 2, y: 0 },
  ])
  expect(route).toEqual(originalRoute)
  expect(obstacles).toEqual(originalObstacles)

  connMap.addConnections([["signal", "new-pad"]])
  const [afterNetMerge] = solver.markThroughObstacleSegments([route])
  expect(afterNetMerge!.route).toEqual([
    {
      ...first!.route[0],
      toNextSegmentCircuitJsonMetadata: {
        pcb_plated_hole_id: "new-first-match",
      },
    },
    { x: 0, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
  ])
  expect(afterNetMerge!.vias).toEqual(first!.vias)
  expect(route).toEqual(originalRoute)
  expect(obstacles).toEqual(originalObstacles)
})
