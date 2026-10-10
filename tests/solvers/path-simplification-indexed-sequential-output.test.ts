import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { MultiSimplifiedPathSolver } from "lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import { VertexShortcutPathSolver } from "lib/solvers/SimplifiedPathSolver/VertexShortcutPathSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("shared indexes preserve sequential path and vertex simplification outputs", (): void => {
  const routes: HighDensityRoute[] = Array.from({ length: 12 }, (_, index) => ({
    connectionName: `signal${index}`,
    traceThickness: 0.15 + (index % 2) * 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [
      { x: 0, y: index * 1.5, z: index % 2 },
      { x: 1, y: index * 1.5 + 0.5, z: index % 2 },
      { x: 2, y: index * 1.5 + 1, z: index % 2 },
      { x: 3, y: index * 1.5 + 1, z: index % 2 },
      { x: 4, y: index * 1.5, z: index % 2 },
    ],
  }))
  const immutableRoute: HighDensityRoute = {
    connectionName: "immutable", traceThickness: 0.7, viaDiameter: 1,
    vias: [{ x: 1.5, y: 7.5 }],
    route: [{ x: 1.5, y: 6.5, z: 0 }, { x: 1.5, y: 8.5, z: 0 }],
  }
  const connMap = new ConnectivityMap({})
  for (const useTraceWidthAwareClearance of [false, true]) {
    for (const enableVertexShortcuts of [false, true]) {
      const expected: HighDensityRoute[] = []
      for (let index = 0; index < routes.length; index++) {
        const params = {
          inputRoute: routes[index],
          otherHdRoutes: [immutableRoute, ...routes.slice(index + 1), ...expected],
          obstacles: [], connMap, colorMap: {}, useTraceWidthAwareClearance,
        }
        const single = new SingleSimplifiedPathSolver5(params)
        single.solve()
        if (enableVertexShortcuts) {
          const vertex = new VertexShortcutPathSolver({ ...params, inputRoute: single.simplifiedRoute })
          vertex.solve()
          expected.push(vertex.simplifiedRoute)
        } else {
          expected.push(single.simplifiedRoute)
        }
      }
      const indexed = new MultiSimplifiedPathSolver({
        unsimplifiedHdRoutes: structuredClone(routes), otherHdRoutes: [immutableRoute],
        obstacles: [], connMap, colorMap: {}, useTraceWidthAwareClearance, enableVertexShortcuts,
      })
      indexed.solve()
      expect(indexed.solved).toBe(true)
      expect(indexed.simplifiedHdRoutes).toEqual(expected)
      expect(indexed.simplifiedHdRoutes[0].route.length).toBeLessThan(routes[0].route.length)
      expect(immutableRoute.route).toEqual([{ x: 1.5, y: 6.5, z: 0 }, { x: 1.5, y: 8.5, z: 0 }])
    }
  }
})
