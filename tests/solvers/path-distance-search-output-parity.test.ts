import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "../../lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import {
  appendLinearOriginalRouteSlice,
  getLinearNearestIndexForDistance,
  getLinearPointAtDistance,
} from "../fixtures/linearPathDistanceOracle"

type SimplificationConfig = ConstructorParameters<
  typeof TraceSimplificationSolver
>[0]
type SerializedConfig = Omit<
  SimplificationConfig,
  "connMap" | "netByConnectionName" | "terminalLayerIndicesByPcbPortId"
> & {
  connMap: Record<string, string[]>
  netByConnectionName?: Array<[string, string]>
  terminalLayerIndicesByPcbPortId?: Array<[string, number[]]>
}

function solveTrial239(): TraceSimplificationSolver {
  const fixture = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "../fixtures/bug-reports/trial239-near-zero-segment/trace-simplification-input.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  ) as { config: SerializedConfig }
  const {
    connMap,
    netByConnectionName,
    terminalLayerIndicesByPcbPortId,
    ...config
  } = fixture.config
  const solver = new TraceSimplificationSolver({
    ...config,
    connMap: new ConnectivityMap(connMap),
    netByConnectionName: netByConnectionName
      ? new Map(netByConnectionName)
      : undefined,
    terminalLayerIndicesByPcbPortId: terminalLayerIndicesByPcbPortId
      ? new Map(
          terminalLayerIndicesByPcbPortId.map(([id, layers]) => [
            id,
            new Set(layers),
          ]),
        )
      : undefined,
  })
  solver.MAX_SIMPLIFICATION_PIPELINE_LOOPS = 4
  solver.solve()
  return solver
}

test("binary path lookups preserve complete Trial239 output and solver iterations", (): void => {
  const prototype = SingleSimplifiedPathSolver5.prototype
  const originalPoint = prototype["getPointAtDistance"]
  const originalNearest = prototype["getNearestIndexForDistance"]
  const originalAppend = prototype["appendOriginalRouteSlice"]
  let reference: TraceSimplificationSolver
  try {
    prototype["getPointAtDistance"] = getLinearPointAtDistance
    prototype["getNearestIndexForDistance"] = getLinearNearestIndexForDistance
    prototype["appendOriginalRouteSlice"] = appendLinearOriginalRouteSlice
    reference = solveTrial239()
  } finally {
    prototype["getPointAtDistance"] = originalPoint
    prototype["getNearestIndexForDistance"] = originalNearest
    prototype["appendOriginalRouteSlice"] = originalAppend
  }
  const actual = solveTrial239()
  expect(reference.solved).toBe(true)
  expect(actual.solved).toBe(true)
  expect(actual.failed).toBe(reference.failed)
  expect(actual.error).toBe(reference.error)
  expect(actual.iterations).toBe(reference.iterations)
  expect(actual.simplifiedHdRoutes).toEqual(reference.simplifiedHdRoutes)
})
