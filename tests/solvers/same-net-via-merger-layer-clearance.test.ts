import { expect, test } from "bun:test"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceInput } from "tests/fixtures/via-merge-clearance-routes"

test("foreign wires block only the layers occupied by the reshaped wire", () => {
  const input = createViaMergeClearanceInput()
  const [anchor, moving, foreign] = input.inputHdRoutes
  input.layerCount = 4
  for (const route of [anchor!, moving!])
    for (const point of route.route) if (point.z === 1) point.z = 3
  input.inputHdRoutes = [moving!]
  input.otherHdRoutes = [anchor!, foreign!]
  const blocked = new SameNetViaMergerSolver(input)
  blocked.solve()
  expect(blocked.getMergedViaHdRoutes()).toEqual([moving!])
  for (const point of foreign!.route) point.z = 1
  const clear = new SameNetViaMergerSolver(input)
  clear.solve()
  expect(clear.getMergedViaHdRoutes()![0]!.vias).toEqual([{ x: -0.1, y: 0 }])
})
