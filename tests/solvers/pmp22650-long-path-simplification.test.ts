import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "../fixtures/bug-reports/pmp22650-layer-transition/path-simplification-input.json.gz",
        import.meta.url,
      ),
    ),
  ).toString("utf8"),
) as {
  config: {
    inputRoute: HighDensityRoute
    otherHdRoutes: HighDensityRoute[]
    obstacles: Obstacle[]
    connMap: Record<string, string[]>
    netByConnectionName: Array<[string, string]>
    outline: Array<{ x: number; y: number }>
    minBoardEdgeClearance: number
  }
}

test("finishes the long PMP22650 path", () => {
  const connectionName = "source_net_altium_pcb_290"
  const inputRoute = fixture.config.otherHdRoutes.find(
    (route) => route.connectionName === connectionName,
  )
  expect(inputRoute).toBeDefined()
  if (!inputRoute) throw new Error(`Missing ${connectionName} in fixture`)

  const solver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: [
      fixture.config.inputRoute,
      ...fixture.config.otherHdRoutes.filter(
        (route) => route.connectionName !== connectionName,
      ),
    ],
    obstacles: fixture.config.obstacles,
    connMap: new ConnectivityMap(fixture.config.connMap),
    netByConnectionName: new Map(fixture.config.netByConnectionName),
    colorMap: {},
    outline: fixture.config.outline,
    minBoardEdgeClearance: fixture.config.minBoardEdgeClearance,
  })

  solver.solve()

  expect(solver.failed).toBeFalse()
  expect(solver.solved).toBeTrue()
  expect(solver.iterations).toBeGreaterThan(1_000)
})
