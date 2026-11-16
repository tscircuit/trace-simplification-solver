import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("merges compatible vias without changing pad or drill dimensions", () => {
  for (const [diameter, holeDiameter] of [
    [0.6, 0.3],
    [1, 0.3],
    [0.6, 0.4],
  ]) {
    const routes: HighDensityRoute[] = [0, 0.2].map((x, index) => ({
      connectionName: `route${index}`,
      traceThickness: 0.1,
      viaDiameter: 0.6,
      route: [
        { x: x - 1, y: 0, z: 0 },
        { x, y: 0, z: 0 },
        { x, y: 0, z: 1 },
        { x: x + 1, y: 0, z: 1 },
      ],
      vias: [
        {
          x,
          y: 0,
          diameter: index ? diameter : 0.6,
          holeDiameter: index ? holeDiameter : 0.3,
        },
      ],
    }))
    const solver = new SameNetViaMergerSolver({
      inputHdRoutes: routes,
      obstacles: [],
      colorMap: {},
      layerCount: 2,
      connMap: new ConnectivityMap({ signal: ["route0", "route1"] }),
    })
    solver.solve()
    const output = solver.getMergedViaHdRoutes()!
    expect(solver.failed).toBe(false)
    expect(output[1]!.vias[0]).toMatchObject({ diameter, holeDiameter })
    if (diameter === 0.6 && holeDiameter === 0.3) {
      expect(output[1]!.vias[0]!.x).toBe(output[0]!.vias[0]!.x)
    } else {
      expect(output.map((route) => route.vias)).toEqual(
        routes.map((route) => route.vias),
      )
    }
  }
})
