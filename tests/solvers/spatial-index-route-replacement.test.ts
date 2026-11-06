import { expect, test } from "bun:test"
import { HighDensityRouteSpatialIndex } from "../../lib/data-structures/HighDensityRouteSpatialIndex"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

test("route replacement removes only the named copper from shared buckets", () => {
  const segment: HighDensityRoute = {
    connectionName: "before_rename",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: -2, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    vias: [{ x: 5, y: 0 }],
  }
  const neighbor: HighDensityRoute = {
    ...segment,
    connectionName: "neighbor",
    route: segment.route.map((point) => ({ ...point, y: 0.25 })),
    vias: [{ x: 5, y: 0.25 }],
  }
  const index = new HighDensityRouteSpatialIndex([segment, neighbor])
  index.removeRoute("missing")
  segment.connectionName = "removed"
  const viaOnly: HighDensityRoute = {
    ...segment,
    route: [],
    vias: [{ x: 6, y: 0 }],
  }
  index.addRoute(viaOnly)

  const routesNear = (x: number): HighDensityRoute[] =>
    index
      .getConflictingRoutesNearPoint({ x, y: 0, z: 0 }, 0.3)
      .map(({ conflictingRoute }) => conflictingRoute)

  expect(routesNear(0)).toEqual([segment, neighbor])
  expect(routesNear(5)).toEqual([segment, neighbor])
  expect(routesNear(6)).toEqual([viaOnly])

  index.removeRoute("removed")
  expect(routesNear(-2)).toEqual([neighbor])
  expect(routesNear(0)).toEqual([neighbor])
  expect(routesNear(5)).toEqual([neighbor])
  expect(routesNear(6)).toEqual([])

  index.addRoute(viaOnly)
  expect(routesNear(6)).toEqual([viaOnly])
  index.removeRoute("removed")
  expect(routesNear(6)).toEqual([])
})
