import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("path simplification indexes nearby obstacles and uses explicit net metadata", () => {
  const inputRoute: HighDensityRoute = {
    connectionName: "input",
    traceThickness: 0.1,
    viaDiameter: 0.4,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    vias: [],
  }
  const sameNetPeer: HighDensityRoute = {
    ...inputRoute,
    connectionName: "same-net-peer",
    route: [
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 1, z: 0 },
    ],
  }
  const differentNetPeer: HighDensityRoute = {
    ...sameNetPeer,
    connectionName: "different-net-peer",
  }
  const nearObstacle: Obstacle = {
    type: "rect",
    center: { x: 1, y: 0.15 },
    width: 0.1,
    height: 0.1,
    layers: ["top"],
    connectedTo: ["blocker"],
  }
  const farObstacle: Obstacle = {
    ...nearObstacle,
    center: { x: 100, y: 100 },
  }

  const solver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: [sameNetPeer, differentNetPeer],
    obstacles: [nearObstacle, farObstacle],
    connMap: new ConnectivityMap({}),
    netByConnectionName: new Map([
      ["input", "net0"],
      ["same-net-peer", "net0"],
      ["different-net-peer", "net1"],
    ]),
    colorMap: {},
  })

  expect(solver.filteredObstacles).toEqual([nearObstacle])
  expect(solver.filteredObstaclePathSegments).toEqual([
    [differentNetPeer.route[0], differentNetPeer.route[1]],
  ])
})
