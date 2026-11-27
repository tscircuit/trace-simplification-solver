import { expect, test } from "bun:test"
import { HighDensityRouteSpatialIndex } from "lib/data-structures/HighDensityRouteSpatialIndex"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("indexes and replaces physical fragments independently of their shared connection name", (): void => {
  const first: HighDensityRoute = {
    connectionName: "power_mst0",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    vias: [],
  }
  const second: HighDensityRoute = {
    ...first,
    route: [
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 1, z: 0 },
    ],
  }
  const index = new HighDensityRouteSpatialIndex([first, second])
  const point = { x: 1, y: 0, z: 0 }
  expect(
    index
      .getConflictingRoutesForSegment(point, point, 0.1)
      .map((item) => item.conflictingRoute),
  ).toEqual([first, second])
  expect(
    index.getRoutesTouchingRoute(first, (route) => route === first),
  ).toEqual(new Set([second]))
  index.removeRoute(first)
  expect(
    index
      .getConflictingRoutesForSegment(point, point, 0.1)
      .map((item) => item.conflictingRoute),
  ).toEqual([second])
  index.addRoute(first)
  expect(
    index.getRoutesTouchingRoute(second, (route) => route === second),
  ).toEqual(new Set([first]))
})
