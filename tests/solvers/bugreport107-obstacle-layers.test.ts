import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { UselessViaRemovalSolver } from "lib/solvers/UselessViaRemovalSolver/UselessViaRemovalSolver"

type CapturedInput = {
  source: { targetConnectionName: string; configSha256: string }
  config: Omit<
    ConstructorParameters<typeof UselessViaRemovalSolver>[0],
    "connMap"
  > & {
    connMap: Record<string, string[]>
  }
}

test("bugreport107 removes a via pair hidden by pads on other copper layers", (): void => {
  const captureFile = readFileSync(
    new URL(
      "../fixtures/bug-reports/bugreport107-obstacle-layers/via-removal-input.json.gz",
      import.meta.url,
    ),
  )
  const capture = JSON.parse(
    gunzipSync(new Uint8Array(captureFile)).toString("utf8"),
  ) as CapturedInput
  expect(
    createHash("sha256").update(JSON.stringify(capture.config)).digest("hex"),
  ).toBe(capture.source.configSha256)
  const config = structuredClone(capture.config)
  const inputRoute = config.unsimplifiedHdRoutes[0]!
  expect(inputRoute.connectionName).toBe(capture.source.targetConnectionName)
  expect(inputRoute.vias).toHaveLength(4)
  const solver = new UselessViaRemovalSolver({
    ...config,
    connMap: new ConnectivityMap(config.connMap),
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const output = solver.getOptimizedHdRoutes()!
  expect(output).toHaveLength(1)
  expect(output[0]!.vias).toHaveLength(2)
  expect(output[0]!.route[0]).toEqual(inputRoute.route[0])
  expect(output[0]!.route.at(-1)).toEqual(inputRoute.route.at(-1))
  expect(output[0]!.startPcbPortId).toBe(inputRoute.startPcbPortId)
  expect(output[0]!.endPcbPortId).toBe(inputRoute.endPcbPortId)
  expect(config).toEqual(capture.config)
})
