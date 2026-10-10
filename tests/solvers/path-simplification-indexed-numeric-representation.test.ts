import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { PathSimplificationGeometryIndex } from "lib/data-structures/PathSimplificationGeometryIndex"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

function expectSamePreparation(
  inputRoute: HighDensityRoute,
  peers: HighDensityRoute[],
  obstacles: Obstacle[],
  useTraceWidthAwareClearance = false,
): void {
  const params = {
    inputRoute,
    otherHdRoutes: peers,
    obstacles,
    connMap: new ConnectivityMap({}),
    colorMap: {},
    useTraceWidthAwareClearance,
  }
  const original = new SingleSimplifiedPathSolver5(params)
  const geometryIndex = new PathSimplificationGeometryIndex(
    [inputRoute],
    peers,
    obstacles,
  )
  const indexed = new SingleSimplifiedPathSolver5({
    ...params,
    geometryQuery: { index: geometryIndex, routeIndex: 0 },
  })
  expect(indexed.filteredObstacles).toEqual(original.filteredObstacles)
  expect(indexed.filteredObstaclePathSegments).toEqual(
    original.filteredObstaclePathSegments,
  )
  expect(indexed.filteredVias).toEqual(original.filteredVias)
  expect(indexed.filteredJumperPads).toEqual(original.filteredJumperPads)
}

test("broad phases preserve cancellation boundaries and partly nonfinite peer geometry", (): void => {
  const inputRoute: HighDensityRoute = {
    connectionName: "target",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    vias: [],
    route: [
      { x: -2, y: 0, z: 0 },
      { x: -0.17500000000000002, y: 0, z: 0 },
    ],
  }
  const obstacle: Obstacle = {
    type: "rect",
    layers: ["top"],
    __zLayers: [0],
    connectedTo: [],
    center: { x: 1, y: 0 },
    width: 2,
    height: 1,
  }
  const ordinaryPeer: HighDensityRoute = {
    connectionName: "peer",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -1, y: 0.1, z: 0 },
      { x: 1, y: 0.1, z: 0 },
    ],
    vias: [],
  }
  expectSamePreparation(inputRoute, [], [obstacle])
  expectSamePreparation(
    inputRoute,
    [
      {
        ...ordinaryPeer,
        traceThickness: 0,
        viaDiameter: 2,
        route: [],
        vias: [{ x: 1, y: 0 }],
      },
    ],
    [],
    true,
  )
  for (const peer of [
    {
      ...ordinaryPeer,
      route: [...ordinaryPeer.route, { x: NaN, y: 99, z: 0 }],
    },
    { ...ordinaryPeer, viaDiameter: NaN, vias: [{ x: 0, y: 0 }] },
    {
      ...ordinaryPeer,
      viaDiameter: undefined as unknown as number,
      vias: [{ x: 0, y: 0 }],
    },
    { ...ordinaryPeer, traceThickness: NaN, vias: [{ x: 0, y: 0 }] },
    {
      ...ordinaryPeer,
      route: [{ x: NaN, y: 0, z: 0 }],
      vias: [{ x: 0, y: 0 }],
    },
    { ...ordinaryPeer, route: [], viaDiameter: -0.1, vias: [{ x: -1, y: 0 }] },
  ]) {
    expectSamePreparation(inputRoute, [peer], [], false)
    expectSamePreparation(inputRoute, [peer], [], true)
  }
  expectSamePreparation(
    inputRoute,
    [],
    [{ ...obstacle, center: { x: NaN, y: 0 } }, obstacle],
  )

  let seed = 7183
  for (let trial = 0; trial < 1200; trial++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const origin = [
      -1e12,
      -1e8,
      -2,
      -Number.MIN_VALUE,
      0,
      Number.MIN_VALUE,
      2,
      1e8,
      1e12,
    ][seed % 9]
    const span = [0, 0.35, 2, 1000][(seed >>> 4) % 4]
    const width = [Number.MIN_VALUE, 1e-10, 0.15, 1, 2, 1e6][(seed >>> 8) % 6]
    const offset =
      (((seed >>> 12) % 7) - 3) *
      Number.EPSILON *
      Math.max(Math.abs(origin), span, 1)
    const route: HighDensityRoute = {
      ...inputRoute,
      route: [
        { x: origin - span, y: 0, z: 0 },
        { x: origin, y: 0, z: 0 },
      ],
    }
    const reconstructedMax = (origin - span + origin) / 2 + span / 2
    const pad = {
      ...obstacle,
      width,
      center: { x: reconstructedMax + 0.175 + width / 2 + offset, y: 0 },
    }
    const peer = {
      ...ordinaryPeer,
      route: [],
      viaDiameter: width * 2,
      vias: [{ x: origin + (0.175 + width) + offset, y: 0 }],
    }
    expectSamePreparation(route, [peer], [pad], false)
    expectSamePreparation(route, [peer], [pad], true)
  }
})
