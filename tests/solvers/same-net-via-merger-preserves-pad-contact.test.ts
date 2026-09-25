import { expect, test } from "bun:test"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergePadContactInput } from "tests/fixtures/via-merge-clearance-routes"

test("a removed barrel cannot disconnect a same-net pad on an intermediate layer", () => {
  const input = createViaMergePadContactInput()
  const before = structuredClone(input.inputHdRoutes)
  const solver = new SameNetViaMergerSolver(input)
  solver.solve()
  expect(solver.getMergedViaHdRoutes()).toEqual(before)
  const pad = input.obstacles[0]!
  const via = before[0]!.vias[0]!
  expect(Math.hypot(via.x - pad.center.x, via.y - pad.center.y)).toBeLessThan(
    before[0]!.viaDiameter / 2 + pad.width / 2,
  )
  // Without that contact, the identical geometry has a valid merge.
  const noPad = new SameNetViaMergerSolver({ ...input, obstacles: [] })
  noPad.solve()
  expect(noPad.getMergedViaHdRoutes()![0]!.vias).toEqual([{ x: -0.3, y: 0 }])
})
