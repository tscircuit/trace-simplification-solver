import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("RVboy's complete cleanup input preserves all three RGB_D1 fragments", () => {
  const captured = JSON.parse(
    gunzipSync(
      new Uint8Array(
        readFileSync(
          new URL("../fixtures/rvboy-final-cleanup.json.gz", import.meta.url),
        ),
      ),
    ).toString(),
  )
  const original = JSON.stringify(captured)
  const solver = new TraceSimplificationSolver({
    ...captured,
    connMap: new ConnectivityMap(captured.connMap),
    terminalLayerIndicesByPcbPortId: new Map(
      captured.terminalLayerIndicesByPcbPortId.map(
        ([id, layers]: [string, number[]]) => [id, new Set(layers)],
      ),
    ),
  })
  const fragments = solver.simplifiedHdRoutes.filter(
    (r) => r.connectionName === "source_net_66",
  )
  expect(fragments).toHaveLength(3)
  const endpoints = (routes: HighDensityRoute[]) =>
    routes.map((route) => [
      route.connectionName,
      ...[route.route[0]!, route.route.at(-1)!].flatMap((p) => [p.x, p.y, p.z]),
    ])
  expect(endpoints(solver.simplifiedHdRoutes)).toEqual(
    endpoints(captured.hdRoutes),
  )
  expect(solver.simplifiedHdRoutes).toHaveLength(483)
  expect(JSON.stringify(captured)).toBe(original)
})
