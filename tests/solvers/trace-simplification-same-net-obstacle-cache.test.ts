import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

class CountingConnectivityMap extends ConnectivityMap {
  lookupCount = 0

  override getNetConnectedToId(connectionId: string): string | undefined {
    this.lookupCount += 1
    return super.getNetConnectedToId(connectionId)
  }
}

test("reuses same-net obstacle classification between simplification passes", () => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const obstacles: Obstacle[] = Array.from({ length: 100 }, (_, index) => ({
    type: "rect",
    layers: ["top", "bottom"],
    center: { x: index, y: 0 },
    width: 0.1,
    height: 0.1,
    connectedTo: ["peer"],
  }))
  const connMap = new CountingConnectivityMap({
    signal_net: ["signal"],
    peer_net: ["peer"],
  })
  const solver = new TraceSimplificationSolver({
    hdRoutes: [route],
    obstacles,
    connMap,
    colorMap: {},
    defaultViaDiameter: 0.3,
    layerCount: 2,
  })
  const lookupCountAfterConstruction = connMap.lookupCount

  solver.markThroughObstacleSegments([route])
  solver.markThroughObstacleSegments([route])

  expect(lookupCountAfterConstruction).toBeGreaterThan(0)
  expect(connMap.lookupCount).toBe(lookupCountAfterConstruction)
})
