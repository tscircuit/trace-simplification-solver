import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

class CountingConnectivityMap extends ConnectivityMap {
  lookupCount = 0

  override getNetConnectedToId(connectionId: string): string | undefined {
    this.lookupCount += 1
    return super.getNetConnectedToId(connectionId)
  }
}

test("shares connectivity lookups between path solvers", () => {
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
  const peerRoutes: HighDensityRoute[] = Array.from(
    { length: 100 },
    (_, index) => ({
      connectionName: "peer",
      rootConnectionName: "peer_alias",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [
        { x: index / 10, y: -1, z: 0 },
        { x: index / 10, y: 1, z: 0 },
      ],
      vias: [],
    }),
  )
  const obstacles: Obstacle[] = Array.from({ length: 100 }, (_, index) => ({
    type: "rect",
    layers: ["top"],
    center: { x: index / 10, y: 0 },
    width: 0.1,
    height: 0.1,
    connectedTo: ["peer"],
  }))
  const connMap = new CountingConnectivityMap({
    signal_net: ["signal", "signal_alias"],
    peer_net: ["peer", "peer_alias"],
  })

  const netConnectedToIdByConnectivityId = {}
  const firstSolver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: peerRoutes,
    obstacles,
    connMap,
    colorMap: {},
    netConnectedToIdByConnectivityId,
  })

  expect(firstSolver.filteredObstacles).toHaveLength(100)
  expect(firstSolver.filteredObstaclePathSegments).toHaveLength(100)
  expect(connMap.lookupCount).toBe(3)

  const secondSolver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: peerRoutes,
    obstacles,
    connMap,
    colorMap: {},
    netConnectedToIdByConnectivityId,
  })

  expect(secondSolver.filteredObstacles).toHaveLength(100)
  expect(secondSolver.filteredObstaclePathSegments).toHaveLength(100)
  expect(connMap.lookupCount).toBe(3)
})
