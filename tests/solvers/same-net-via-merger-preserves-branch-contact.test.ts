import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

test("does not remove a via that is the only physical contact to an immutable branch", (): void => {
  const [anchor, moving, branch] = createViaMergeClearanceRoutes()
  anchor!.route[1]!.x = -0.3
  anchor!.route[2]!.x = -0.3
  anchor!.vias[0]!.x = -0.3
  moving!.route[0]!.y = -1
  moving!.route[3]!.y = -1
  branch!.route = [
    { x: 0, y: 0.14, z: 0 },
    { x: 0, y: 1, z: 0 },
  ]
  const solver = new SameNetViaMergerSolver({
    inputHdRoutes: [moving!],
    otherHdRoutes: [anchor!, branch!],
    obstacles: [],
    colorMap: {},
    layerCount: 2,
    preserveRouteEndpoints: true,
    clearanceConstraints: { traceMargin: 0.1, obstacleMargin: 0.1 },
    connMap: new ConnectivityMap({ power: ["left", "diagonal", "neighbor"] }),
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.getMergedViaHdRoutes()).toEqual([moving!])
})
