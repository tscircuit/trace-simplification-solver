import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

test("evaluates another occupied target after a candidate is rejected without leaking its geometry", (): void => {
  const input = createViaMergeClearanceRoutes().slice(0, 2)
  const original = structuredClone(input)
  const targets: number[] = []
  const solver = new SameNetViaMergerSolver({
    inputHdRoutes: input,
    obstacles: [],
    colorMap: {},
    layerCount: 2,
    preserveRouteEndpoints: true,
    clearanceConstraints: { traceMargin: 0.1, obstacleMargin: 0.1 },
    connMap: new ConnectivityMap({ power: ["left", "diagonal"] }),
  })
  let accepted = input
  for (const { routes } of solver.getClearancePreservingMergeCandidates()) {
    targets.push(routes[0]!.vias[0]!.x)
    expect(solver.getMergedViaHdRoutes()).toEqual(original)
    if (routes.every((route) => route.vias[0]!.x === 0)) {
      accepted = routes
      break
    }
  }
  expect(targets).toEqual([-0.1, 0])
  expect(accepted.flatMap((route) => route.vias)).toEqual([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ])
  expect(input).toEqual(original)
})
