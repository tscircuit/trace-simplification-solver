import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"

test.each([undefined, 1, 3])(
  "trace simplification completes the configured number of passes: %s",
  (iterations): void => {
    const solver = new TraceSimplificationSolver({
      hdRoutes: [
        {
          connectionName: "signal",
          traceThickness: 0.15,
          viaDiameter: 0.3,
          route: [
            { x: -2, y: 0, z: 0 },
            { x: -1, y: 1, z: 0 },
            { x: 1, y: 1, z: 0 },
            { x: 2, y: 0, z: 0 },
          ],
          vias: [],
        },
      ],
      obstacles: [],
      connMap: new ConnectivityMap({}),
      colorMap: {},
      defaultViaDiameter: 0.3,
      layerCount: 2,
      iterations,
      enableVertexShortcuts: true,
      useTraceWidthAwareClearance: true,
    })

    solver.solve()

    expect(solver.solved).toBeTrue()
    expect(solver.failed).toBeFalse()
    expect(solver.simplificationPipelineLoops).toBe(iterations ?? 2)
    expect(solver.simplifiedHdRoutes[0]!.route).toEqual([
      { x: -2, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ])
  },
)
