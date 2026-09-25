import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

test("checks the foreign via radius and clearance along the reshaped wire", (): void => {
  const [anchor, diagonal, neighbor] = createViaMergeClearanceRoutes()
  neighbor!.route = [
    { x: 0.5, y: 0.94, z: 0 },
    { x: 0.5, y: 0.94, z: 1 },
  ]
  neighbor!.vias = [{ x: 0.5, y: 0.94 }]
  const solver = new SameNetViaMergerSolver({
    inputHdRoutes: [diagonal!],
    otherHdRoutes: [anchor!, neighbor!],
    obstacles: [],
    colorMap: {},
    layerCount: 2,
    preserveRouteEndpoints: true,
    clearanceConstraints: { traceMargin: 0.1, obstacleMargin: 0.1 },
    connMap: new ConnectivityMap({
      power: ["left", "diagonal"],
      signal: ["neighbor"],
    }),
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.getMergedViaHdRoutes()).toEqual([diagonal!])
})
