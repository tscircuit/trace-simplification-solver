import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

class CountingConnectivityMap extends ConnectivityMap {
  lookupCount = 0

  override getNetConnectedToId(connectionId: string): string | undefined {
    this.lookupCount++
    return super.getNetConnectedToId(connectionId)
  }
}

test("through-obstacle marking only checks obstacles at each transition", () => {
  const obstacle = (
    centerX: number,
    connectedTo: string,
    pcbPlatedHoleId?: string,
  ): Obstacle => ({
    type: "rect",
    layers: ["top", "bottom"],
    connectedTo: [connectedTo],
    center: { x: centerX, y: 0 },
    width: 0.5,
    height: 0.5,
    circuitJsonMetadata: pcbPlatedHoleId
      ? { pcb_plated_hole_id: pcbPlatedHoleId }
      : undefined,
  })
  const obstacles = [
    obstacle(0, "terminal", "first-match"),
    ...Array.from({ length: 1_000 }, (_, index) =>
      obstacle(100 + index, `unrelated-${index}`),
    ),
    obstacle(0, "terminal", "second-match"),
  ]
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const connMap = new CountingConnectivityMap({
    net: ["signal", "terminal"],
  })
  const solver = new TraceSimplificationSolver({
    hdRoutes: [],
    obstacles,
    connMap,
    colorMap: {},
    defaultViaDiameter: 0.3,
    layerCount: 2,
  })

  const [markedRoute] = solver.markThroughObstacleSegments([route])

  expect(markedRoute!.route[0]).toEqual({
    x: 0,
    y: 0,
    z: 0,
    toNextSegmentType: "through_obstacle",
    toNextSegmentCircuitJsonMetadata: {
      pcb_plated_hole_id: "first-match",
    },
  })
  expect(markedRoute!.vias).toEqual([])
  expect(connMap.lookupCount).toBe(4)
})
