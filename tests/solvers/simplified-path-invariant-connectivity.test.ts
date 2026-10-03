import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "lib/types/high-density-types"
import type { Obstacle } from "lib/types"

test("simplification shares route connectivity across copper obstacle types", () => {
  const route = (name: string, root?: string): HighDensityRoute => ({
    connectionName: name,
    rootConnectionName: root,
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    vias: [{ x: 2, y: 0 }],
    jumpers: [
      {
        route_type: "jumper",
        footprint: "0603",
        start: { x: 1, y: 0 },
        end: { x: 3, y: 0 },
      },
    ],
  })
  const connMap = new ConnectivityMap({
    primary: ["signal", "same-primary"],
    root: ["source-signal", "same-root"],
  })
  let connectivityQueries = 0
  const areIdsConnected = connMap.areIdsConnected.bind(connMap)
  connMap.areIdsConnected = (first, second) => {
    connectivityQueries++
    return areIdsConnected(first, second)
  }
  const unrelated = route("unrelated", "unrelated-root")
  const peers = [
    route("same-primary"),
    route("peer-alias", "same-root"),
    unrelated,
  ]
  const obstacles: Obstacle[] = [
    {
      type: "rect",
      layers: ["top"],
      center: { x: 2, y: 0 },
      width: 0.3,
      height: 0.3,
      connectedTo: ["same-primary"],
    },
  ]
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute: route("signal", "source-signal"),
    otherHdRoutes: peers,
    obstacles,
    connMap,
    colorMap: {},
  })
  expect(solver.filteredObstacles).toEqual([])
  expect(solver.filteredObstaclePathSegments).toEqual([
    [unrelated.route[0], unrelated.route[1]],
  ])
  expect(solver.filteredVias).toEqual([{ x: 2, y: 0, diameter: 0.3 }])
  expect(solver.filteredJumperPads.map((pad) => pad.connectionName)).toEqual([
    "unrelated",
    "unrelated",
    "signal",
    "signal",
  ])
  // One obstacle query and one ordered comparison of each peer's IDs.
  // The three copper collections reuse those comparisons.
  expect(connectivityQueries).toBe(10)
})
