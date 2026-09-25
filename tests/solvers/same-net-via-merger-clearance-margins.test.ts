import { expect, test } from "bun:test"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceInput } from "tests/fixtures/via-merge-clearance-routes"

test("clearance constraints reject invalid distances before generating geometry", () => {
  for (const key of [
    "traceMargin",
    "obstacleMargin",
    "boardEdgeMargin",
  ] as const) {
    for (const value of [-0.1, NaN, Infinity]) {
      const input = createViaMergeClearanceInput()
      input.clearanceConstraints![key] = value
      expect(() => new SameNetViaMergerSolver(input)).toThrow(
        "finite nonnegative margins",
      )
    }
  }
  const input = createViaMergeClearanceInput()
  input.clearanceConstraints = {
    traceMargin: 0,
    obstacleMargin: 0,
    boardEdgeMargin: 0,
  }
  expect(() => new SameNetViaMergerSolver(input)).not.toThrow()
})
