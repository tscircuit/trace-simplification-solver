import { expect, test } from "bun:test"
import { getCrossingTransitionComparisonSvg } from "tests/fixtures/get-crossing-transition-comparison-svg"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { CrossingViaReductionSolver } from "lib/solvers/CrossingViaReductionSolver/crossing-via-reduction-solver"
import { createCrossingViaReductionRoutes } from "tests/fixtures/crossing-via-reduction-routes"

test("duplicate route points preserve the outgoing through-obstacle segment", async () => {
  const routes = createCrossingViaReductionRoutes()
  // A zero-length wire ends where the marked plated-obstacle transition starts.
  // These points coincide, but only the latter owns the outgoing segment metadata.
  routes[1]!.route.unshift(
    { x: 1, y: 5, z: 0 },
    {
      x: 1,
      y: 5,
      z: 0,
      toNextSegmentType: "through_obstacle",
      toNextSegmentCircuitJsonMetadata: {
        pcb_plated_hole_id: "terminal-hole",
      },
    },
  )
  const before = structuredClone(routes)
  const solver = new CrossingViaReductionSolver({
    inputHdRoutes: routes,
    obstacles: [],
    connMap: new ConnectivityMap({
      detour_net: ["detour"],
      transition_net: ["transition"],
    }),
    layerCount: 2,
  })
  const beforeGraphics = solver.visualize()
  let error: Error | undefined
  try {
    solver.solve()
  } catch (cause) {
    error = cause as Error
  }
  await expect(
    getCrossingTransitionComparisonSvg(solver, beforeGraphics, before, error),
  ).toMatchSvgSnapshot(import.meta.path)
  expect(error?.message).toContain("layer transition without a via")
  expect(routes).toEqual(before)
})
