import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("endpoint preservation tracks every fragment of a shared connection", () => {
  const routes: HighDensityRoute[] = [0, 1, 2].map((x) => ({
    connectionName: "signal",
    rootConnectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.45,
    vias: [],
    route: [
      { x, y: 0, z: 0 },
      { x: x + 0.5, y: 0, z: 0 },
      { x: x + 1, y: 0, z: 0 },
    ],
  }))
  const original = structuredClone(routes)
  const solver = new TraceSimplificationSolver({
    hdRoutes: routes,
    obstacles: [],
    connMap: new ConnectivityMap({ signal: ["signal"] }),
    colorMap: {},
    defaultViaDiameter: 0.45,
    layerCount: 2,
    preserveRouteEndpoints: true,
  })
  solver.solve()
  expect(solver.failed).toBeFalse()
  expect(solver.solved).toBeTrue()
  expect(
    solver.simplifiedHdRoutes.map((r) => [r.route[0], r.route.at(-1)]),
  ).toEqual(routes.map((r) => [r.route[0], r.route.at(-1)]))
  const validate = (
    solver as unknown as {
      validatePreservedRouteEndpoints: (routes: HighDensityRoute[]) => void
    }
  ).validatePreservedRouteEndpoints.bind(solver)
  expect(() => validate([...routes].reverse())).not.toThrow()
  expect(() => validate(routes.slice(1))).toThrow(
    "changed the preserved route set",
  )
  expect(() => validate([routes[0]!, routes[0]!, routes[2]!])).toThrow(
    "changed a preserved endpoint",
  )
  const changedLayer = structuredClone(routes)
  changedLayer[1]!.route[0]!.z = 1
  expect(() => validate(changedLayer)).toThrow("changed a preserved endpoint")
  expect(routes).toEqual(original)
})
