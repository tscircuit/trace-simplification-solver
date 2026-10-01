import { expect, test } from "bun:test"
import type { HighDensityIntraNodeRoute } from "../../lib/types/high-density-types"
import { MultiSimplifiedPathSolver } from "../../lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"

const createRoute = (params: {
  connectionName: string
  x: number
  y: number
  traceThickness?: number
}): HighDensityIntraNodeRoute => ({
  connectionName: params.connectionName,
  traceThickness: params.traceThickness ?? 0.15,
  viaDiameter: 0.6,
  route: [
    { x: params.x, y: params.y, z: 0 },
    { x: params.x + 2, y: params.y, z: 0 },
  ],
  vias: [],
})

test("only passes spatially relevant routes to the path simplifier in original order", () => {
  const previousRoute = createRoute({
    connectionName: "previous-original",
    x: 0,
    y: 0.15,
  })
  const currentRoute = createRoute({
    connectionName: "current",
    x: 0,
    y: 0,
  })
  const futureRoute = createRoute({
    connectionName: "future",
    x: 0,
    y: -0.15,
  })
  const distantFutureRoute = createRoute({
    connectionName: "distant-future",
    x: 100,
    y: 100,
  })
  const previousSimplifiedRoute = {
    ...previousRoute,
    connectionName: "previous-simplified",
  }
  const solver = new MultiSimplifiedPathSolver({
    unsimplifiedHdRoutes: [
      previousRoute,
      currentRoute,
      futureRoute,
      distantFutureRoute,
    ],
    otherHdRoutes: [
      createRoute({ connectionName: "immutable-near", x: 0, y: 0.1 }),
      createRoute({ connectionName: "immutable-far", x: -100, y: -100 }),
    ],
    obstacles: [],
  })
  solver.currentUnsimplifiedHdRouteIndex = 1
  solver.simplifiedHdRoutes = [previousSimplifiedRoute]

  solver.step()

  expect(
    solver.activeSubSolver?.otherHdRoutes.map(
      ({ connectionName }) => connectionName,
    ),
  ).toEqual(["immutable-near", "future", "previous-simplified"])
})

test("includes routes whose via, jumper pad, or wide copper reaches the query", () => {
  const routeWithNearbyVia = createRoute({
    connectionName: "nearby-via",
    x: 100,
    y: 100,
  })
  routeWithNearbyVia.vias = [{ x: 1, y: 0.2 }]
  const routeWithNearbyJumper = createRoute({
    connectionName: "nearby-jumper",
    x: 100,
    y: 100,
  })
  routeWithNearbyJumper.jumpers = [
    {
      route_type: "jumper",
      start: { x: 1, y: -0.2 },
      end: { x: 2, y: -0.2 },
      footprint: "0603",
    },
  ]
  const solver = new MultiSimplifiedPathSolver({
    unsimplifiedHdRoutes: [
      createRoute({ connectionName: "current", x: 0, y: 0 }),
    ],
    otherHdRoutes: [
      createRoute({
        connectionName: "wide-copper",
        x: 0,
        y: 0.6,
        traceThickness: 1,
      }),
      routeWithNearbyVia,
      routeWithNearbyJumper,
    ],
    obstacles: [],
    useTraceWidthAwareClearance: true,
  })

  solver.step()

  expect(
    solver.activeSubSolver?.otherHdRoutes.map(
      ({ connectionName }) => connectionName,
    ),
  ).toEqual(["wide-copper", "nearby-via", "nearby-jumper"])
})
