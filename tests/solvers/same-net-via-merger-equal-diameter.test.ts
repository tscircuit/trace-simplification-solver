import { expect, test } from "bun:test"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceInput } from "tests/fixtures/via-merge-clearance-routes"

test("a merge cannot silently replace a drill site with different copper diameter", () => {
  const input = createViaMergeClearanceInput()
  input.inputHdRoutes = input.inputHdRoutes.slice(0, 2)
  input.inputHdRoutes[0]!.viaDiameter = 0.4
  const solver = new SameNetViaMergerSolver(input)
  solver.solve()
  expect(solver.getMergedViaHdRoutes()).toEqual(input.inputHdRoutes)
  input.inputHdRoutes[0]!.viaDiameter = 0.3
  const equal = new SameNetViaMergerSolver(input)
  equal.solve()
  expect(equal.stats.mergedViaGroups).toBe(1)
})
