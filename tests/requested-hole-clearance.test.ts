import { expect, test } from "bun:test"
import { segmentToCircleMinDistance } from "@tscircuit/math-utils"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "../lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityIntraNodeRoute } from "../lib/types/high-density-types"
import type { Obstacle } from "../lib/types"

test("simplification honors the requested trace-to-hole clearance", (): void => {
  for (const holeClearance of [0.2, 0.3, 0.1]) {
    const obstacles: Obstacle[] = [
      {
        type: "rect",
        shape: "circle",
        isNonPlatedHole: true,
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top", "bottom"],
        connectedTo: [],
      },
    ]
    const route: HighDensityIntraNodeRoute = {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -2, y: -0.7, z: 0 },
        { x: -1.5, y: -1.2, z: 0 },
        { x: 1.5, y: -1.2, z: 0 },
        { x: 2, y: -0.7, z: 0 },
      ],
    }
    const original = structuredClone(obstacles)
    const solver = new TraceSimplificationSolver({
      hdRoutes: [route],
      obstacles,
      connMap: new ConnectivityMap({}),
      colorMap: {},
      defaultViaDiameter: 0.3,
      layerCount: 2,
      minTraceToPadEdgeClearance: 0.1,
      minTraceToHoleEdgeClearance: holeClearance,
    })
    solver.solve()
    expect(solver.failed).toBe(false)
    expect(solver.solved).toBe(true)
    const output = solver.simplifiedHdRoutes[0]!
    const gap = Math.min(
      ...output.route.slice(1).map(
        (point, i): number =>
          segmentToCircleMinDistance(output.route[i]!, point, {
            x: 0,
            y: 0,
            radius: 0.5,
          }) - output.traceThickness / 2,
      ),
    )
    expect(gap).toBeGreaterThanOrEqual(holeClearance - 1e-9)
    expect(obstacles).toEqual(original)
  }
})
