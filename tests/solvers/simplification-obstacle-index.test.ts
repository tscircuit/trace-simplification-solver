import { expect, test } from "bun:test"
import { SimplificationObstacleIndex } from "../../lib/solvers/SimplifiedPathSolver/SimplificationObstacleIndex"
import type { HighDensityIntraNodeRoute } from "../../lib/types/high-density-types"

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

test("returns nearby copper features in simplifier route order", () => {
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
  const index = new SimplificationObstacleIndex({
    unsimplifiedHdRoutes: [
      previousRoute,
      currentRoute,
      futureRoute,
      createRoute({ connectionName: "distant-future", x: 100, y: 100 }),
    ],
    otherHdRoutes: [
      createRoute({ connectionName: "immutable-near", x: 0, y: 0.1 }),
      createRoute({ connectionName: "immutable-far", x: -100, y: -100 }),
    ],
  })
  index.replaceRoute({
    routeIndex: 0,
    route: { ...previousRoute, connectionName: "previous-simplified" },
  })

  const features = index.getNearbyFeatures({
    bounds: { minX: 0, minY: 0, maxX: 2, maxY: 0 },
    currentRouteIndex: 1,
    margin: 0.25,
  })

  expect(features.map(({ route }) => route.connectionName)).toEqual([
    "immutable-near",
    "future",
    "previous-simplified",
  ])
})

test("indexes segments, vias, and jumper pads separately", () => {
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
  const index = new SimplificationObstacleIndex({
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
  })

  const features = index.getNearbyFeatures({
    bounds: { minX: 0, minY: 0, maxX: 2, maxY: 0 },
    currentRouteIndex: 0,
    margin: 0.675,
  })

  expect(
    features.map(({ kind, route }) => [kind, route.connectionName]),
  ).toEqual([
    ["segment", "wide-copper"],
    ["via", "nearby-via"],
    ["jumper_pad", "nearby-jumper"],
    ["jumper_pad", "nearby-jumper"],
  ])
})
