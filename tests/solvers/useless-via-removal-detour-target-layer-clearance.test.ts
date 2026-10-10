import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { HighDensityRouteSpatialIndex } from "lib/data-structures/HighDensityRouteSpatialIndex"
import { ObstacleSpatialHashIndex } from "lib/data-structures/ObstacleTree"
import { createObstacleDetourPathValidator } from "lib/solvers/UselessViaRemovalSolver/create-obstacle-detour-path-validator"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("detour validation checks pads only on the candidate layer", () => {
  const route: HighDensityRoute = {
    connectionName: "moving_net",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    vias: [],
  }
  const connMap = new ConnectivityMap({ moving_net: [route.connectionName] })
  for (const zLayers of [[0], [1], [0, 1]]) {
    const obstacle: Obstacle = {
      type: "rect",
      center: { x: 1, y: 0 },
      width: 0.5,
      height: 0.5,
      layers: zLayers.map((z) => (z === 0 ? "top" : "bottom")),
      __zLayers: zLayers,
      connectedTo: ["other_net"],
    }
    const validate = createObstacleDetourPathValidator({
      targetZ: 1,
      route,
      hdRouteSHI: new HighDensityRouteSpatialIndex([route]),
      obstacleSHI: new ObstacleSpatialHashIndex("flatbush", [obstacle]),
      connMap,
      defaultTraceThickness: 0.15,
      obstacleMargin: 0.15,
      traceMargin: 0.1,
      useNumericSegmentKeys: false,
    })
    expect(validate(route.route, 0)).toBe(!zLayers.includes(1))
  }
})
