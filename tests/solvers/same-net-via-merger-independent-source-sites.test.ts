import { expect, test } from "bun:test"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceInput } from "tests/fixtures/via-merge-clearance-routes"

test("an unsafe source site does not suppress a safe merge into the same target", () => {
  const input = createViaMergeClearanceInput()
  input.inputHdRoutes.push({
    connectionName: "third",
    rootConnectionName: "left",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 0.5, y: 0 }],
    route: [
      { x: 1, y: -1, z: 0 },
      { x: 0.5, y: 0, z: 0 },
      { x: 0.5, y: 0, z: 1 },
      { x: 1, y: -1, z: 1 },
    ],
  })
  input.obstacles = [
    {
      type: "rect",
      shape: "circle",
      center: { x: 0.55, y: -0.4 },
      width: 0.1,
      height: 0.1,
      layers: ["top"],
      connectedTo: ["signal"],
    },
  ]
  const solver = new SameNetViaMergerSolver(input)
  const proposals = [...solver.getClearancePreservingMergeCandidates()]
  expect(
    proposals.some(
      ({ routes }) =>
        routes[0]!.vias[0]!.x === 0 && routes[3]!.vias[0]!.x === 0.5,
    ),
  ).toBe(true)
  expect(proposals.some(({ routes }) => routes[3]!.vias[0]!.x === 0)).toBe(
    false,
  )
  expect(solver.getMergedViaHdRoutes()).toEqual(input.inputHdRoutes)
})
