import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

test("clearance cleanup cannot enlarge the copper at an occupied via site", () => {
  const [anchor, larger] = createViaMergeClearanceRoutes()
  larger!.viaDiameter = 0.6
  const solver = new SameNetViaMergerSolver({
    inputHdRoutes: [larger!],
    otherHdRoutes: [anchor!],
    obstacles: [],
    colorMap: {},
    layerCount: 2,
    traceMargin: 0.1,
    connMap: new ConnectivityMap({ power: ["left", "diagonal"] }),
  })
  expect([...solver.getClearancePreservingMergeCandidates()]).toEqual([])
  solver.solve()
  expect(solver.mergedViaHdRoutes).toEqual([larger!])
})
