import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { CrossingViaReductionSolver } from "lib/solvers/CrossingViaReductionSolver/crossing-via-reduction-solver"
import { createCrossingViaReductionRoutes } from "tests/fixtures/crossing-via-reduction-routes"

test("deduplication keeps a terminal but clears stale zero-length segment metadata", () => {
  const routes = createCrossingViaReductionRoutes()
  const first = routes[1]!.route[0]!
  routes[1]!.route.splice(1, 0, { x: first.x, y: first.y, z: first.z })
  first.toNextSegmentType = "through_obstacle"
  first.toNextSegmentCircuitJsonMetadata = {
    pcb_plated_hole_id: "zero-length-only",
  }
  const solver = new CrossingViaReductionSolver({
    inputHdRoutes: routes,
    obstacles: [],
    layerCount: 2,
    connMap: new ConnectivityMap({
      detour_net: ["detour"],
      transition_net: ["transition"],
    }),
  })
  solver.solve()
  const [detour, transition] = solver.getReducedHdRoutes()
  expect(solver.solved).toBe(true)
  expect(detour!.vias).toHaveLength(0)
  expect(transition!.vias).toHaveLength(1)
  expect(transition!.route[0]!.pcb_port_id).toBe("transition-start")
  expect(transition!.route[0]!.toNextSegmentType).toBeUndefined()
  expect(transition!.route[0]!.toNextSegmentCircuitJsonMetadata).toBeUndefined()
})
