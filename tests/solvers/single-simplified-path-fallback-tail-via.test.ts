import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("keeps the via after a fallback vertex that is ahead of the head", () => {
  // The blocker allows simplified paths along y = 0 only up to x ~= 2.05, so
  // the fallback starts from the middle of the 4 mm segment and appends its
  // far vertex B. The via follows B by 0.1 mm.
  const inputRoute: HighDensityRoute = {
    connectionName: "target",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4.1, y: 0, z: 0 },
      { x: 4.1, y: 0, z: 1 },
      { x: 4.1, y: 4, z: 1 },
    ],
    vias: [{ x: 4.1, y: 0 }],
  }
  const blockingRoute: HighDensityRoute = {
    connectionName: "blocker",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 2.2, y: 0.2, z: 0 },
      { x: 5, y: 0.2, z: 0 },
    ],
    vias: [],
  }
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: [blockingRoute],
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
  })

  solver.solve()

  const outputRoute = solver.simplifiedRoute
  const layerChanges = outputRoute.route.slice(1).flatMap((point, index) => {
    const previousPoint = outputRoute.route[index]!
    return previousPoint.z === point.z ? [] : [[previousPoint, point]]
  })
  expect(layerChanges).toEqual([
    [
      { x: 4.1, y: 0, z: 0 },
      { x: 4.1, y: 0, z: 1 },
    ],
  ])
  expect(outputRoute.vias).toEqual([{ x: 4.1, y: 0 }])
})
