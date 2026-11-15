import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"

test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "trace simplification rejects invalid pass counts: %s",
  (iterations): void => {
    expect(
      () =>
        new TraceSimplificationSolver({
          hdRoutes: [],
          obstacles: [],
          connMap: new ConnectivityMap({}),
          colorMap: {},
          defaultViaDiameter: 0.3,
          layerCount: 2,
          iterations,
        }),
    ).toThrow("iterations must be a positive integer")
  },
)
