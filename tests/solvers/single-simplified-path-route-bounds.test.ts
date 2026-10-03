import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("filters distant route segments before exact segment clearance", () => {
  const inputRoute: HighDensityRoute = {
    connectionName: "input",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ],
    vias: [],
  }
  const farRoute: HighDensityRoute = {
    connectionName: "far",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 100, y: 100, z: 0 },
      { x: 101, y: 100, z: 0 },
    ],
    vias: [],
  }
  const partiallyNearbyRoute: HighDensityRoute = {
    connectionName: "partially-nearby",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: -100, y: 0.2, z: 0 },
      { x: 0.5, y: 0.2, z: 0 },
      { x: 100, y: 10, z: 0 },
    ],
    vias: [],
  }

  const solver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: [farRoute, partiallyNearbyRoute],
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
  })

  expect(solver.filteredObstaclePathSegments).toEqual([
    [partiallyNearbyRoute.route[0], partiallyNearbyRoute.route[1]],
    [partiallyNearbyRoute.route[1], partiallyNearbyRoute.route[2]],
  ])
})
