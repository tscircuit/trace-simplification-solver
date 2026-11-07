import { expect, test } from "bun:test"
import { HighDensityRouteSpatialIndex } from "../../lib/data-structures/HighDensityRouteSpatialIndex"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

test("identity removal preserves same-name peers without reading unrelated names", () => {
  const route: HighDensityRoute = {
    connectionName: "shared",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0.4, y: 0, z: 0 },
    ],
    vias: [{ x: 0.2, y: 0 }],
  }
  const peer: HighDensityRoute = {
    ...route,
    route: route.route.map((point) => ({ ...point, y: 0.5 })),
    vias: [{ x: 0.2, y: 0.5 }],
  }
  let unrelatedNameReads = 0
  const unrelated: HighDensityRoute = {
    ...route,
    get connectionName(): string {
      unrelatedNameReads++
      return "unrelated"
    },
    route: [
      { x: 10, y: 0, z: 0 },
      { x: 11, y: 0, z: 0 },
    ],
    vias: [],
  }
  const index = new HighDensityRouteSpatialIndex([route, peer, unrelated])
  unrelatedNameReads = 0

  index.removeRoute({ ...route })
  expect(
    index
      .getConflictingRoutesNearPoint({ x: 0.2, y: 0, z: 0 }, 0.1)
      .map(({ conflictingRoute }) => conflictingRoute),
  ).toEqual([route])
  index.removeRoute(route)
  index.removeRoute(route)

  expect(unrelatedNameReads).toBe(0)
  expect(
    index.getConflictingRoutesNearPoint({ x: 0.2, y: 0, z: 0 }, 0.1),
  ).toEqual([])
  expect(
    index
      .getConflictingRoutesNearPoint({ x: 0.2, y: 0.5, z: 0 }, 0.1)
      .map(({ conflictingRoute }) => conflictingRoute),
  ).toEqual([peer])
  expect(
    index
      .getConflictingRoutesNearPoint({ x: 10.5, y: 0, z: 0 }, 0.1)
      .map(({ conflictingRoute }) => conflictingRoute),
  ).toEqual([unrelated])
})
