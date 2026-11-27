import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { UselessViaRemovalSolver } from "lib/solvers/UselessViaRemovalSolver/UselessViaRemovalSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("retains vias needed by a branch while removing an independent redundant pair", (): void => {
  for (const finalLayer of [0, 2]) {
    const route: HighDensityRoute = {
      connectionName: "trunk",
      rootConnectionName: "power",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 3 },
        { x: 2, y: 0, z: 3 },
        { x: 2, y: 0, z: finalLayer },
        { x: 3, y: 0, z: finalLayer },
      ],
      vias: [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    }
    const branch: HighDensityRoute = {
      ...route,
      connectionName: "branch",
      route: [
        { x: 1.5, y: 0, z: 3 },
        { x: 1.5, y: 1, z: 3 },
      ],
      vias: [],
    }
    for (const otherHdRoutes of [[], [branch]]) {
      const solver = new UselessViaRemovalSolver({
        unsimplifiedHdRoutes: [route],
        otherHdRoutes,
        obstacles: [],
        colorMap: {},
        layerCount: 4,
        connMap: new ConnectivityMap({ power: ["trunk", "branch"] }),
      })
      solver.solve()
      expect(solver.failed).toBe(false)
      expect(solver.solved).toBe(true)
      const optimized = solver.getOptimizedHdRoutes()![0]!
      expect(optimized.vias).toHaveLength(
        otherHdRoutes.length ? 2 : finalLayer === 0 ? 0 : 1,
      )
      expect(optimized.route.some((point) => point.z === 3)).toBe(
        otherHdRoutes.length > 0,
      )
    }
  }
})
