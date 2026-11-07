import { expect, test } from "bun:test"
import { HighDensityRouteSpatialIndex } from "../../lib/data-structures/HighDensityRouteSpatialIndex"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

test("removal uses recorded buckets after route mutation before and after lookup creation", () => {
  for (const initializeLookup of [false, true]) {
    const route: HighDensityRoute = {
      connectionName: "original",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      route: [
        { x: -2, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      vias: [{ x: 5, y: 0 }],
    }
    const index = new HighDensityRouteSpatialIndex([route])
    if (initializeLookup) index.removeRoute("missing")

    route.connectionName = "renamed"
    route.route[0].x = 20
    route.route[1].x = 21
    route.vias[0].x = 25
    route.route = [
      { x: 30, y: 0, z: 0 },
      { x: 31, y: 0, z: 0 },
    ]
    route.vias = [{ x: 35, y: 0 }]
    index.removeRoute(route)

    expect(
      index.getConflictingRoutesForSegment(
        { x: -2, y: 0, z: 0 },
        { x: 36, y: 0, z: 0 },
        0.1,
      ),
    ).toEqual([])

    index.addRoute(route)
    expect(
      index
        .getConflictingRoutesNearPoint({ x: 30.5, y: 0, z: 0 }, 0.1)
        .map(({ conflictingRoute }) => conflictingRoute),
    ).toEqual([route])
    expect(
      index
        .getConflictingRoutesNearPoint({ x: 35, y: 0, z: 0 }, 0.1)
        .map(({ conflictingRoute }) => conflictingRoute),
    ).toEqual([route])
    index.removeRoute("renamed")
    expect(
      index.getConflictingRoutesForSegment(
        { x: -2, y: 0, z: 0 },
        { x: 36, y: 0, z: 0 },
        0.1,
      ),
    ).toEqual([])
  }
})
