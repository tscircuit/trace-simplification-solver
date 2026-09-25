import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { minimumDistanceBetweenSegments } from "lib/utils/minimumDistanceBetweenSegments"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

test("chooses the safe occupied via when the other target bends a wire too close to foreign copper", (): void => {
  const input = createViaMergeClearanceRoutes()
  const original = structuredClone(input)
  // Swapping route order must not turn the safe input into a clearance error.
  for (const routes of [input, [input[1]!, input[0]!, input[2]!]]) {
    const solver = new SameNetViaMergerSolver({
      inputHdRoutes: routes,
      obstacles: [],
      colorMap: {},
      layerCount: 2,
      preserveRouteEndpoints: true,
      clearanceConstraints: { traceMargin: 0.1, obstacleMargin: 0.1 },
      connMap: new ConnectivityMap({
        power: ["left", "diagonal"],
        signal: ["neighbor"],
      }),
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    const output = solver.getMergedViaHdRoutes()!
    expect(output.flatMap((route) => route.vias)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ])
    const diagonal = output.find(
      (route) => route.connectionName === "diagonal",
    )!
    const neighbor = input[2]!
    const gap =
      minimumDistanceBetweenSegments(
        diagonal.route[0]!,
        diagonal.route[1]!,
        neighbor.route[0]!,
        neighbor.route[1]!,
      ) - 0.1
    expect(gap).toBeGreaterThan(0.1)
    expect(diagonal.route).toEqual(input[1]!.route)
  }
  expect(input).toEqual(original)
})
