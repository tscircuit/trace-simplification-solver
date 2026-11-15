import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

test("includes a neighboring wire's expanded width in clearance checks", (): void => {
  const [anchor, diagonal, neighbor] = createViaMergeClearanceRoutes()
  neighbor!.traceThickness = 0.01
  for (const point of neighbor!.route) point.traceThickness = 0.1
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
