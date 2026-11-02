import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { MultiSimplifiedPathSolver } from "../../lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"
import type { HighDensityIntraNodeRoute } from "../../lib/types/high-density-types"

test("simplifies a long via chain without exhausting the single-route budget", (): void => {
  const route: HighDensityIntraNodeRoute = {
    connectionName: "long-via-chain",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [{ x: 0, y: 0, z: 0 }],
    vias: [],
  }
  for (let index = 0; index < 900; index++) {
    route.route.push(
      { x: index + 1, y: 0, z: index % 2 },
      { x: index + 1, y: 0, z: (index + 1) % 2 },
    )
    route.vias.push({ x: index + 1, y: 0 })
  }
  const solver = new MultiSimplifiedPathSolver({
    unsimplifiedHdRoutes: [route],
    obstacles: [],
    connMap: new ConnectivityMap({}),
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  expect(solver.simplifiedHdRoutes[0].vias).toEqual(route.vias)
  expect(solver.simplifiedHdRoutes[0].route.at(-1)).toMatchObject(
    route.route.at(-1)!,
  )
})
