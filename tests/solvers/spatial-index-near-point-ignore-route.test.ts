import { expect, test } from "bun:test"
import { HighDensityRouteSpatialIndex } from "../../lib/data-structures/HighDensityRouteSpatialIndex"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

test("getConflictingRoutesNearPoint honors the ignoreRoute predicate", () => {
  const routeA: HighDensityRoute = {
    connectionName: "route-a",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: -2, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    vias: [{ x: 5, y: 0 }],
  }
  const routeB: HighDensityRoute = {
    ...routeA,
    connectionName: "route-b",
    route: routeA.route.map((point) => ({ ...point, y: 0.25 })),
    vias: [{ x: 5, y: 0.25 }],
  }
  const index = new HighDensityRouteSpatialIndex([routeA, routeB])
  const ignoreA = (route: HighDensityRoute) =>
    route.connectionName === "route-a"

  const namesNear = (
    point: { x: number; y: number; z: number },
    ignore?: (route: HighDensityRoute) => boolean,
  ) =>
    index
      .getConflictingRoutesNearPoint(point, 0.3, ignore)
      .map(({ conflictingRoute }) => conflictingRoute.connectionName)

  // Baseline: both routes conflict without a predicate
  expect(namesNear({ x: 0, y: 0, z: 0 })).toEqual(["route-a", "route-b"])

  // Ignoring route-a must drop both its segment and its via conflicts
  expect(namesNear({ x: 0, y: 0, z: 0 }, ignoreA)).toEqual(["route-b"])
  expect(namesNear({ x: 5, y: 0.1, z: 0 }, ignoreA)).toEqual(["route-b"])

  // Ignoring every route leaves no conflicts
  expect(namesNear({ x: 0, y: 0, z: 0 }, () => true)).toEqual([])
  expect(namesNear({ x: 5, y: 0.1, z: 0 }, () => true)).toEqual([])
})
