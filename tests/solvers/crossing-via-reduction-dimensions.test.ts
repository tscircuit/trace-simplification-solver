import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { CrossingViaReductionSolver } from "lib/solvers/CrossingViaReductionSolver/crossing-via-reduction-solver"
import { createCrossingViaReductionRoutes } from "tests/fixtures/crossing-via-reduction-routes"
import { createSameRouteMultiSectionCrossing } from "tests/fixtures/crossing-via-reduction-multi-crossing-routes"

test("crossing reduction preserves relocated via dimensions", () => {
  for (const multiple of [false, true]) {
    for (const reverse of [false, true]) {
      const routes = multiple
        ? createSameRouteMultiSectionCrossing()
        : createCrossingViaReductionRoutes()
      const transition = routes[1]!
      transition.vias = transition.vias.map((via, index) => ({
        ...via,
        diameter: 0.4 + index * 0.1,
        holeDiameter: 0.2 + index * 0.05,
      }))
      if (reverse) transition.route.reverse()
      const dimensions = transition.vias.map(({ diameter, holeDiameter }) => ({
        diameter,
        holeDiameter,
      }))
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
      const output = solver.getReducedHdRoutes()
      expect(solver.failed).toBe(false)
      expect(solver.stats.viasRemovedByCrossingReductions).toBe(2)
      expect(output[0]!.vias).toHaveLength(0)
      expect(output[1]!.vias).not.toEqual(transition.vias)
      expect(
        output[1]!.vias.map(({ diameter, holeDiameter }) => ({
          diameter,
          holeDiameter,
        })),
      ).toEqual(reverse ? dimensions.toReversed() : dimensions)
    }
  }
})
