import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "lib/types/high-density-types"
import { frozenSegmentToBoundsMinDistance } from "../fixtures/frozen-segment-to-bounds-distance"

test("prepared constructor geometry keeps live changes and order", () => {
  const connMap = new ConnectivityMap({ first: ["input", "input-root"] })
  const inputRoute: HighDensityRoute = {
    connectionName: "input",
    rootConnectionName: "input-root",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 4, z: 0 },
    ],
    vias: [],
  }
  const peer = (
    name: string,
    route: HighDensityRoute["route"],
    thickness = 0.15,
  ): HighDensityRoute => ({
    connectionName: name,
    traceThickness: thickness,
    viaDiameter: 0.3,
    route,
    vias: [],
  })
  const peers: HighDensityRoute[] = [
    peer("near", [
      { x: -1, y: 4.25, z: 1 },
      { x: 4, y: 4.25, z: 1 },
      { x: 4, y: 4.25, z: 0 },
    ]),
    peer("same", [
      { x: 1, y: 0, z: 0 },
      { x: 3, y: 2, z: 0 },
    ]),
    peer(
      "far",
      [
        { x: 40, y: 20, z: 0 },
        { x: 42, y: 22, z: 0 },
      ],
      0.7,
    ),
    peer(
      "wide",
      [
        { x: 0, y: 4.5, z: 0, traceThickness: 0.9 },
        { x: 4, y: 4.5, z: 0 },
      ],
      0.7,
    ),
  ]
  peers.push(peers[0])
  const mutations: Array<() => void> = [
    () => {},
    () => {
      inputRoute.route[1].y = 6
    },
    () => {
      peers[2].route[0].x = 2
      peers[2].route[0].y = 2
    },
    () => {
      peers[0].traceThickness = 0.8
    },
    () => {
      peers[0].route[0].traceThickness = 1.1
    },
    () => {
      inputRoute.traceThickness = 0.6
    },
    () => {
      peers[1].rootConnectionName = "input-root"
    },
    () => {
      peers[1].rootConnectionName = "unrelated"
    },
    () => {
      connMap.addConnections([["input", "same"]])
    },
    () => {
      inputRoute.route[0].x = -2
      inputRoute.route[0].y = -2
    },
  ]
  for (const mutate of mutations) {
    mutate()
    for (const useTraceWidthAwareClearance of [false, true]) {
      const bounds = inputRoute.route.reduce(
        (result, point) => ({
          minX: Math.min(result.minX, point.x),
          maxX: Math.max(result.maxX, point.x),
          minY: Math.min(result.minY, point.y),
          maxY: Math.max(result.maxY, point.y),
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
      )
      const maximumOtherThickness = useTraceWidthAwareClearance
        ? Math.max(
            0,
            ...peers.flatMap((route) => [
              route.traceThickness,
              ...route.route.map(
                (point) => point.traceThickness ?? route.traceThickness,
              ),
            ]),
          )
        : 0.15
      const margin = useTraceWidthAwareClearance
        ? 0.1 + inputRoute.traceThickness / 2 + maximumOtherThickness / 2
        : 0.1 + 0.15
      const expected: Array<[
        HighDensityRoute["route"][number],
        HighDensityRoute["route"][number],
      ]> = []
      for (const route of peers) {
        const inputIds = [
          inputRoute.connectionName,
          inputRoute.rootConnectionName,
        ].filter((id): id is string => id !== undefined)
        const peerIds = [
          route.connectionName,
          route.rootConnectionName,
        ].filter((id): id is string => id !== undefined)
        const sameNet = inputIds.some((inputId) =>
          peerIds.some(
            (peerId) =>
              inputId === peerId || connMap.areIdsConnected(inputId, peerId),
          ),
        )
        if (sameNet) continue
        for (let index = 0; index < route.route.length - 1; index++) {
          const start = route.route[index]
          const end = route.route[index + 1]
          if (frozenSegmentToBoundsMinDistance(start, end, bounds) <= margin) {
            expected.push([start, end])
          }
        }
      }
      const solver = new SingleSimplifiedPathSolver5({
        inputRoute,
        otherHdRoutes: peers,
        obstacles: [],
        connMap,
        colorMap: {},
        useTraceWidthAwareClearance,
      })
      expect(solver.filteredObstaclePathSegments.length).toBe(expected.length)
      for (let index = 0; index < expected.length; index++) {
        expect(solver.filteredObstaclePathSegments[index][0]).toBe(
          expected[index][0],
        )
        expect(solver.filteredObstaclePathSegments[index][1]).toBe(
          expected[index][1],
        )
      }
    }
  }
})
