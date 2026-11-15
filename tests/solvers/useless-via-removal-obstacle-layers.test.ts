import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { UselessViaRemovalSolver } from "lib/solvers/UselessViaRemovalSolver/UselessViaRemovalSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"
import type { Obstacle } from "lib/types"

test("via removal checks pad clearance only on the destination copper layer", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: -2, y: 0, z: 1 },
      { x: -1, y: 0, z: 1 },
      { x: -1, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
    vias: [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ],
  }
  for (const layers of [["top"], ["bottom"], ["inner1"], ["top", "inner1"]]) {
    const obstacle: Obstacle = {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 0.5,
      height: 0.5,
      layers,
      connectedTo: ["other_net"],
    }
    const input = structuredClone(route)
    const solver = new UselessViaRemovalSolver({
      unsimplifiedHdRoutes: [input],
      obstacles: [obstacle],
      connMap: new ConnectivityMap({
        signal: ["signal"],
        other_net: ["other_net"],
      }),
      colorMap: {},
      layerCount: 4,
      preserveRouteEndpoints: true,
      enableGeometryShortcuts: false,
    })
    solver.solve()
    expect(solver.failed).toBe(false)
    expect(solver.solved).toBe(true)
    const result = solver.getOptimizedHdRoutes()![0]!
    expect(result.vias).toHaveLength(layers.includes("inner1") ? 2 : 0)
    expect(result.route[0]).toEqual(route.route[0])
    expect(result.route.at(-1)).toEqual(route.route.at(-1))
    expect(input).toEqual(route)
    expect(obstacle.__zLayers).toBeUndefined()
  }
})
