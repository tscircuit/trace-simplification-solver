import { expect, test } from "bun:test"
import { segmentToCircleMinDistance } from "@tscircuit/math-utils"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "../lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { Obstacle } from "../lib/types"
import type { HighDensityIntraNodeRoute } from "../lib/types/high-density-types"

test("shortcut clearance uses the circular hole outline", (): void => {
  const hole: Obstacle = {
    type: "rect",
    shape: "circle",
    isNonPlatedHole: true,
    center: { x: 0, y: 0 },
    width: 1.2,
    height: 1.2,
    layers: ["top", "bottom"],
    connectedTo: [],
  }
  const route: HighDensityIntraNodeRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [
      { x: 0.2, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 0.2, z: 0 },
    ],
  }
  const original = structuredClone(route)
  const solver = new TraceSimplificationSolver({
    hdRoutes: [route],
    obstacles: [hole],
    connMap: new ConnectivityMap({}),
    colorMap: {},
    defaultViaDiameter: 0.3,
    layerCount: 2,
    minTraceToPadEdgeClearance: 0.1,
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  const output = solver.simplifiedHdRoutes[0]!
  let length = 0
  for (let i = 1; i < output.route.length; i++) {
    const a = output.route[i - 1]!
    const b = output.route[i]!
    length += Math.hypot(b.x - a.x, b.y - a.y)
    const gap =
      segmentToCircleMinDistance(a, b, { x: 0, y: 0, radius: 0.6 }) -
      output.traceThickness / 2
    expect(gap).toBeGreaterThanOrEqual(0.1 - 1e-9)
  }
  expect(length).toBeLessThan(1.2)
  expect(output.route[0]).toEqual(original.route[0])
  expect(output.route.at(-1)).toEqual(original.route.at(-1))
  expect(route).toEqual(original)
})
