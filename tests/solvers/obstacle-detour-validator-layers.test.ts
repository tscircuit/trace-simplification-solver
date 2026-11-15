import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { HighDensityRouteSpatialIndex } from "lib/data-structures/HighDensityRouteSpatialIndex"
import { ObstacleSpatialHashIndex } from "lib/data-structures/ObstacleTree"
import { createObstacleDetourPathValidator } from "lib/solvers/UselessViaRemovalSolver/create-obstacle-detour-path-validator"
import type { HighDensityRoute } from "lib/types/high-density-types"
import type { Obstacle } from "lib/types"

test("detour clearance and its cache respect the obstacle copper layers", (): void => {
  const path = [
    { x: -1, y: 0, z: 1 },
    { x: 1, y: 0, z: 1 },
  ]
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: path,
    vias: [],
  }
  for (const zLayers of [[0], [3], [1], [0, 1, 2, 3], undefined]) {
    for (const useNumericSegmentKeys of [false, true]) {
      const obstacle: Obstacle = {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.5,
        height: 0.5,
        layers: ["top"],
        __zLayers: zLayers,
        connectedTo: ["other_net"],
      }
      const validate = createObstacleDetourPathValidator({
        targetZ: 1,
        route,
        hdRouteSHI: new HighDensityRouteSpatialIndex([route]),
        obstacleSHI: new ObstacleSpatialHashIndex("flatbush", [obstacle]),
        connMap: new ConnectivityMap({
          signal: ["signal"],
          other_net: ["other_net"],
        }),
        defaultTraceThickness: 0.15,
        obstacleMargin: 0.1,
        traceMargin: 0.1,
        useNumericSegmentKeys,
      })
      const clear = zLayers !== undefined && !zLayers.includes(1)
      expect(validate(path, 0)).toBe(clear)
      expect(validate([...path].reverse(), 0)).toBe(clear)
    }
  }
})
