import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { PathSimplificationGeometryIndex } from "lib/data-structures/PathSimplificationGeometryIndex"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("indexed preparation retains exact clearance boundaries, large vias, pads and empty geometry", (): void => {
  for (const origin of [
    -1e8,
    -1,
    -Number.MIN_VALUE,
    0,
    Number.MIN_VALUE,
    1,
    1e8,
  ]) {
    const inputRoute: HighDensityRoute = {
      connectionName: "signal",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: origin, y: 0, z: 0 },
        { x: origin, y: 1, z: 0 },
      ],
    }
    for (const gap of [
      0.175 - Number.EPSILON,
      0.175,
      0.175 + Number.EPSILON,
      0.25 - Number.EPSILON,
      0.25,
      0.25 + Number.EPSILON,
    ]) {
      const obstacles: Obstacle[] = [
        {
          type: "rect",
          layers: ["top"],
          __zLayers: [0],
          connectedTo: ["pad"],
          center: { x: origin + gap + 0.5, y: 0.5 },
          width: 1,
          height: 1,
        },
      ]
      const peers: HighDensityRoute[] = [
        {
          connectionName: "trace",
          traceThickness: 0.15,
          viaDiameter: 4,
          route: [
            { x: origin + gap, y: 0, z: 0 },
            { x: origin + gap, y: 1, z: 0 },
          ],
          vias: [{ x: origin + 2 + gap, y: 0.5 }],
        },
        {
          connectionName: "jumper",
          traceThickness: 0.15,
          viaDiameter: 0.3,
          route: [],
          vias: [],
          jumpers: [
            {
              route_type: "jumper",
              start: { x: origin + 0.4, y: 0.5 },
              end: { x: origin + 2, y: 0.5 },
              footprint: "1206",
            },
          ],
        },
        {
          connectionName: "empty",
          traceThickness: 0.15,
          viaDiameter: 0.3,
          route: [],
          vias: [],
        },
      ]
      const geometryIndex = new PathSimplificationGeometryIndex(
        [inputRoute],
        peers,
        obstacles,
      )
      const params = {
        inputRoute,
        otherHdRoutes: peers,
        obstacles,
        connMap: new ConnectivityMap({}),
        colorMap: {},
      }
      const reference = new SingleSimplifiedPathSolver5(params)
      const indexed = new SingleSimplifiedPathSolver5({
        ...params,
        geometryQuery: { index: geometryIndex, routeIndex: 0 },
      })
      expect(indexed.filteredObstacles).toEqual(reference.filteredObstacles)
      expect(indexed.filteredObstaclePathSegments).toEqual(
        reference.filteredObstaclePathSegments,
      )
      expect(indexed.filteredVias).toEqual(reference.filteredVias)
      expect(indexed.filteredJumperPads).toEqual(reference.filteredJumperPads)
      expect(
        indexed.isValidPathSegment(inputRoute.route[0], inputRoute.route[1]),
      ).toBe(
        reference.isValidPathSegment(inputRoute.route[0], inputRoute.route[1]),
      )
    }
  }
  const empty = new PathSimplificationGeometryIndex([], [], [])
  expect(
    empty.getCandidateObstacles({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 0.2),
  ).toEqual([])
  expect(
    empty.getCandidateRoutes({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 0.2, 0),
  ).toEqual([])
})
