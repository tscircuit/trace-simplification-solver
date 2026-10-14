import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "lib/types/high-density-types"

const routedTrace: HighDensityRoute = {
  connectionName: "source_net_26_mst1",
  rootConnectionName: "source_net_26",
  startPcbPortId: "pcb_port_210",
  endPcbPortId: "pcb_port_179",
  traceThickness: 0.15,
  viaDiameter: 0.3,
  vias: [
    { x: 74.65, y: 80.274 },
    { x: 70.3633891248597, y: 82.84505946069211 },
  ],
  route: [
    { x: 74.68025604077395, y: 80.30425604077395, z: 0 },
    { x: 74.65, y: 80.274, z: 0 },
    { x: 74.65, y: 80.274, z: 1 },
    { x: 72.72562990716537, y: 79.58434205577328, z: 1 },
    { x: 70.3633891248597, y: 82.84505946069211, z: 1 },
    { x: 70.3633891248597, y: 82.84505946069211, z: 0 },
    { x: 70.05392786416758, y: 82.5355982, z: 0 },
  ],
}

const nearbyTrace: HighDensityRoute = {
  connectionName: "source_net_13",
  rootConnectionName: "source_net_13",
  startPcbPortId: "pcb_port_7",
  endPcbPortId: "pcb_port_183",
  traceThickness: 0.15,
  viaDiameter: 0.3,
  vias: [],
  route: [
    { x: 70.477, y: 82.164, z: 1 },
    { x: 70.628, y: 83.062, z: 1 },
  ],
}

test("preserves DRV8307EVM layer transitions during path simplification", (): void => {
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute: routedTrace,
    otherHdRoutes: [nearbyTrace],
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
  })

  solver.solve()

  const simplifiedRoute = solver.simplifiedRoute
  const invalidLayerTransitions = simplifiedRoute.route.filter(
    (point, index, route) => {
      const nextPoint = route[index + 1]
      return (
        nextPoint !== undefined &&
        point.z !== nextPoint.z &&
        (point.x !== nextPoint.x || point.y !== nextPoint.y)
      )
    },
  )

  expect(invalidLayerTransitions).toEqual([])
  expect(simplifiedRoute.vias).toContainEqual({ x: 74.65, y: 80.274 })
  expect(simplifiedRoute.vias).toContainEqual({
    x: 70.3633891248597,
    y: 82.84505946069211,
  })
})
