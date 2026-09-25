import { expect, test } from "bun:test"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceInput } from "tests/fixtures/via-merge-clearance-routes"

test("a terminal identity inside a transition cluster remains fixed", () => {
  const input = createViaMergeClearanceInput()
  const [anchor, moving] = input.inputHdRoutes
  moving!.route[1]!.pcb_port_id = "terminal"
  input.inputHdRoutes = [moving!]
  input.otherHdRoutes = [anchor!]
  const solver = new SameNetViaMergerSolver(input)
  solver.solve()
  expect(solver.getMergedViaHdRoutes()).toEqual([moving!])
  delete moving!.route[1]!.pcb_port_id
  const movable = new SameNetViaMergerSolver(input)
  movable.solve()
  expect(movable.stats.mergedViaGroups).toBe(1)
})
