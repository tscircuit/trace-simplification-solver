import { expect, test } from "bun:test"
import { HighDensityRouteSpatialIndex } from "lib/data-structures/HighDensityRouteSpatialIndex"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("indexes individual via radii on creation and update", () => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [],
    vias: [
      { x: 0, y: 0, diameter: 4 },
      { x: 10, y: 0, diameter: 0.3 },
    ],
  }
  for (const update of [false, true]) {
    const index = new HighDensityRouteSpatialIndex(update ? [] : [route])
    if (update) index.addRoute(route)
    for (const [x, expected] of [
      [1.9, true],
      [11.9, false],
    ] as const) {
      expect(
        index.hasConflictingRoutesForSegment(
          { x, y: -1, z: 0 },
          { x, y: 1, z: 0 },
          0.1,
          () => false,
        ),
      ).toBe(expected)
    }
    expect(
      index.getConflictingRoutesNearPoint({ x: 1.9, y: 0, z: 0 }, 0.1),
    ).toHaveLength(1)
    expect(
      index.getConflictingRoutesNearPoint({ x: 11.9, y: 0, z: 0 }, 0.1),
    ).toHaveLength(0)
    expect(
      index.getConflictingRoutesForSegment(
        { x: 1.9, y: -1, z: 0 },
        { x: 1.9, y: 1, z: 0 },
        0.1,
      ),
    ).toHaveLength(1)
  }
})
