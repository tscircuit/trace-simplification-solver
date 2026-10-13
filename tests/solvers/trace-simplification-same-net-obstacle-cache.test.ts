import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"
import type { Obstacle } from "lib/types"

class CountingConnectivityMap extends ConnectivityMap {
  connectivityCheckCount = 0

  override areIdsConnected(id1: string, id2: string): boolean {
    this.connectivityCheckCount++
    return super.areIdsConnected(id1, id2)
  }
}

test("resolves same-net multilayer obstacles once while marking one route", () => {
  const route: HighDensityRoute = {
    connectionName: "trace-a",
    traceThickness: 0.15,
    viaDiameter: 0.6,
    route: [
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
    ],
    vias: [
      { x: -0.5, y: 0 },
      { x: 0.5, y: 0 },
    ],
  }
  const obstacles: Obstacle[] = [
    {
      type: "rect",
      layers: ["top", "bottom"],
      center: { x: 0, y: 0 },
      width: 4,
      height: 2,
      connectedTo: ["pad-a"],
    },
    {
      type: "rect",
      layers: ["top", "bottom"],
      center: { x: 10, y: 10 },
      width: 1,
      height: 1,
      connectedTo: ["pad-b"],
    },
  ]
  const connMap = new CountingConnectivityMap({
    "net-a": ["trace-a", "pad-a"],
    "net-b": ["pad-b"],
  })
  const solver = new TraceSimplificationSolver({
    hdRoutes: [route],
    obstacles,
    connMap,
    colorMap: {},
    defaultViaDiameter: 0.6,
    layerCount: 2,
  })

  expect(connMap.connectivityCheckCount).toBe(2)
  expect(solver.simplifiedHdRoutes[0]?.vias).toEqual([])
  expect(
    solver.simplifiedHdRoutes[0]?.route
      .slice(0, -1)
      .every((point) => point.toNextSegmentType === "through_obstacle"),
  ).toBe(true)

  solver.markThroughObstacleSegments([
    {
      ...route,
      connectionName: "single-layer-trace",
      route: [
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      vias: [],
    },
  ])
  expect(connMap.connectivityCheckCount).toBe(2)
})
