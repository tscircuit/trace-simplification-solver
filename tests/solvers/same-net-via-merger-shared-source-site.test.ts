import { expect, test } from "bun:test"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceInput } from "tests/fixtures/via-merge-clearance-routes"

test("every owner of a shared physical source via moves in the same proposal", () => {
  const input = createViaMergeClearanceInput()
  const [anchor, moving] = input.inputHdRoutes
  const shared = {
    ...structuredClone(moving!),
    connectionName: "shared",
    rootConnectionName: "diagonal",
  }
  input.inputHdRoutes = [moving!, shared]
  input.otherHdRoutes = [anchor!]
  const solver = new SameNetViaMergerSolver(input)
  const proposals = [...solver.getClearancePreservingMergeCandidates()]
  expect(proposals).toHaveLength(1)
  expect(proposals[0]!.routes.map((route) => route.vias)).toEqual([
    [{ x: -0.1, y: 0 }],
    [{ x: -0.1, y: 0 }],
  ])
  expect(
    proposals[0]!.routes.map((route) => route.route.map((point) => point.z)),
  ).toEqual(
    input.inputHdRoutes.map((route) => route.route.map((point) => point.z)),
  )
  expect(solver.getMergedViaHdRoutes()).toEqual(input.inputHdRoutes)
})
