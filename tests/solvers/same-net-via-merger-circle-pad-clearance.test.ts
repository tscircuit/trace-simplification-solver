import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceInput } from "tests/fixtures/via-merge-clearance-routes"

test("a circular foreign pad uses edge distance rather than its center or bounding square", () => {
  const input = createViaMergeClearanceInput()
  const [anchor, moving] = input.inputHdRoutes
  input.inputHdRoutes = [moving!]
  input.otherHdRoutes = [anchor!]
  const center = { x: 0.5, y: 0.9 }
  input.obstacles = [
    {
      type: "rect",
      shape: "circle",
      center,
      width: 0.3,
      height: 0.3,
      layers: ["top"],
      connectedTo: ["signal"],
    },
  ]
  const blocked = new SameNetViaMergerSolver(input)
  blocked.solve()
  expect(blocked.getMergedViaHdRoutes()).toEqual([moving!])
  center.y = 1.1
  const clear = new SameNetViaMergerSolver(input)
  clear.solve()
  const route = clear.getMergedViaHdRoutes()![0]!
  expect(route.vias).toEqual([{ x: -0.1, y: 0 }])
  expect(
    pointToSegmentDistance(center, route.route[0]!, route.route[1]!) -
      0.15 -
      0.05,
  ).toBeGreaterThan(0.1)
})
