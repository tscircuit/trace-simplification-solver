import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

class CountingConnectivityMap extends ConnectivityMap {
  comparisonCount = 0

  override areIdsConnected(firstId: string, secondId: string): boolean {
    this.comparisonCount += 1
    return super.areIdsConnected(firstId, secondId)
  }
}

test("classifies each obstacle connection once", () => {
  const inputRoute: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
    vias: [],
  }
  const obstacles: Obstacle[] = Array.from({ length: 100 }, (_, index) => ({
    type: "rect",
    layers: ["top"],
    center: { x: index / 10, y: 0 },
    width: 0.1,
    height: 0.1,
    connectedTo: ["other_signal"],
  }))
  const connectivityMap = new CountingConnectivityMap({
    signal_net: ["signal"],
    other_signal_net: ["other_signal"],
  })

  const solver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: [],
    obstacles,
    connMap: connectivityMap,
    colorMap: {},
  })

  expect(solver.filteredObstacles).toHaveLength(100)
  expect(connectivityMap.comparisonCount).toBe(obstacles.length)
})
