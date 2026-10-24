import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "../../lib/types/high-density-types"
import {
  appendLinearOriginalRouteSlice,
  getLinearNearestIndexForDistance,
  getLinearPointAtDistance,
} from "../fixtures/linearPathDistanceOracle"

test("path distance queries preserve inclusive boundaries and exceptional numeric inputs", (): void => {
  const pointsByCase: HighDensityRoute["route"][] = [
    [],
    [{ x: 1, y: 2, z: 0 }],
    [
      { x: -2, y: -1, z: 0 },
      { x: -2, y: -1, z: 1 },
      { x: 1, y: -1, z: 1 },
      { x: 1, y: 2, z: 1 },
      { x: 1, y: 2, z: 0 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 1e140, y: 0, z: 0 },
      { x: 1e140, y: 0, z: 1 },
      { x: 1e140, y: 1, z: 1 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 1e308, y: 0, z: 0 },
      { x: 1e308, y: 1, z: 1 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: Number.NaN, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: Infinity, y: 0, z: 0 },
      { x: Infinity, y: 1, z: 1 },
    ],
  ]
  for (const points of pointsByCase) {
    const params = {
      inputRoute: {
        connectionName: "distance-boundaries",
        traceThickness: 0.15,
        viaDiameter: 0.3,
        route: points,
        vias: [],
      },
      otherHdRoutes: [],
      obstacles: [],
      connMap: new ConnectivityMap({}),
      colorMap: {},
    }
    const solver = new SingleSimplifiedPathSolver5(params)
    const reference = new SingleSimplifiedPathSolver5(params)
    const segments = solver["pathSegments"]
    let previousEnd = 0
    let hasNonNumericEnd = false
    for (const segment of segments) {
      expect(Object.is(segment.startDistance, previousEnd)).toBe(true)
      if (Number.isNaN(segment.endDistance)) {
        hasNonNumericEnd = true
      } else {
        expect(hasNonNumericEnd).toBe(false)
        expect(segment.endDistance).toBeGreaterThanOrEqual(previousEnd)
      }
      previousEnd = segment.endDistance
    }
    const distances = [
      -Infinity,
      -1,
      -Number.MIN_VALUE,
      -0,
      0,
      Number.MIN_VALUE,
      0.00001,
      0.5,
      1,
      2,
      100,
      Infinity,
      Number.NaN,
      solver["totalPathLength"] + 1,
      ...segments.flatMap((segment) => [
        segment.startDistance,
        segment.endDistance,
        segment.endDistance - Number.EPSILON,
        segment.endDistance + Number.EPSILON,
        (segment.startDistance + segment.endDistance) / 2,
      ]),
    ]
    for (const distance of distances) {
      const expectedIndex = segments.findIndex(
        (segment) =>
          distance >= segment.startDistance && distance <= segment.endDistance,
      )
      expect(solver["findPathSegmentIndex"](distance)).toBe(expectedIndex)
      expect(solver["getPointAtDistance"](distance)).toEqual(
        getLinearPointAtDistance.call(reference, distance),
      )
      expect(solver["getNearestIndexForDistance"](distance)).toBe(
        getLinearNearestIndexForDistance.call(reference, distance),
      )
      for (const endIndex of [-1, 0, points.length - 1, points.length + 4]) {
        solver.newRoute = points.length ? [points[0]] : []
        reference.newRoute = points.length ? [points[0]] : []
        if (expectedIndex === -1) {
          const message = `Could not find path segment containing distance ${distance}`
          expect(() =>
            solver["appendOriginalRouteSlice"](distance, endIndex),
          ).toThrow(message)
          expect(() =>
            appendLinearOriginalRouteSlice.call(reference, distance, endIndex),
          ).toThrow(message)
        } else {
          solver["appendOriginalRouteSlice"](distance, endIndex)
          appendLinearOriginalRouteSlice.call(reference, distance, endIndex)
        }
        expect(solver.newRoute).toEqual(reference.newRoute)
      }
    }
  }
})
