import { expect, test } from "bun:test"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceInput } from "tests/fixtures/via-merge-clearance-routes"

test("the complete wire width must clear a board edge even when its endpoint is on it", () => {
  const input = createViaMergeClearanceInput()
  const [anchor, moving] = input.inputHdRoutes
  input.inputHdRoutes = [moving!]
  input.otherHdRoutes = [anchor!]
  input.outline = [
    { x: -0.1, y: -2 },
    { x: 2, y: -2 },
    { x: 2, y: 2 },
    { x: -0.1, y: 2 },
  ]
  input.clearanceConstraints!.boardEdgeMargin = 0.1
  const solver = new SameNetViaMergerSolver(input)
  solver.solve()
  expect(solver.getMergedViaHdRoutes()).toEqual([moving!])
  input.outline[0]!.x = input.outline[3]!.x = -0.3
  const clear = new SameNetViaMergerSolver(input)
  clear.solve()
  expect(clear.stats.mergedViaGroups).toBe(1)
})
