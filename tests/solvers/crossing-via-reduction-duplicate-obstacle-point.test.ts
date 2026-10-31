import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { CrossingViaReductionSolver } from "lib/solvers/CrossingViaReductionSolver/crossing-via-reduction-solver"
import { createCrossingViaReductionRoutes } from "tests/fixtures/crossing-via-reduction-routes"

test("duplicate route points preserve the outgoing through-obstacle segment", () => {
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
  solver.solve()
  const [detour, transition] = solver.getReducedHdRoutes()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(detour!.vias).toHaveLength(0)
  expect(transition!.vias).toHaveLength(1)
  expect(transition!.route[0]).toMatchObject({
    x: 1,
    y: 5,
    z: 0,
    toNextSegmentType: "through_obstacle",
    toNextSegmentCircuitJsonMetadata: { pcb_plated_hole_id: "terminal-hole" },
  })
  expect(transition!.route[1]).toMatchObject({ x: 0, y: 4, z: 1 })
  expect(routes).toEqual(before)
})
