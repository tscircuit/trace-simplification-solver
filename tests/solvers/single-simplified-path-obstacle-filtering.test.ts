import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("checks connectivity only for obstacles near the route bounds", () => {
  const inputRoute: HighDensityRoute = {
    connectionName: "source_trace_target",
    traceThickness: 0.1,
    viaDiameter: 0.45,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ],
    vias: [],
  }
  const farObstacles: Obstacle[] = Array.from(
    { length: 1_000 },
    (_, index) => ({
      type: "rect",
      center: { x: 100 + index, y: 100 },
      width: 1,
      height: 1,
      layers: ["top"],
      connectedTo: [`pcb_smtpad_far_${index}`],
    }),
  )
  const nearbyDifferentNetObstacle: Obstacle = {
    type: "rect",
    center: { x: 0.5, y: 0 },
    width: 0.1,
    height: 0.1,
    layers: ["top"],
    connectedTo: ["pcb_smtpad_nearby"],
  }
  const nearbySameNetObstacle: Obstacle = {
    ...nearbyDifferentNetObstacle,
    center: { x: 0.75, y: 0 },
    connectedTo: ["pcb_smtpad_same_net"],
  }
  const connMap = new ConnectivityMap({
    target: ["source_trace_target", "pcb_smtpad_same_net"],
  })
  let connectivityLookupCount = 0
  const getNetConnectedToId = connMap.getNetConnectedToId.bind(connMap)
  connMap.getNetConnectedToId = (id) => {
    connectivityLookupCount++
    return getNetConnectedToId(id)
  }

  const solver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: [],
    obstacles: [
      ...farObstacles,
      nearbyDifferentNetObstacle,
      nearbySameNetObstacle,
    ],
    connMap,
    colorMap: {},
  })

  expect(solver.filteredObstacles).toEqual([nearbyDifferentNetObstacle])
  expect(connectivityLookupCount).toBe(3)
})
