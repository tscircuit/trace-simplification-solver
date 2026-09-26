import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

test("clearance proposals are opt-in and never mutate the current routing", () => {
  const input = {
    inputHdRoutes: createViaMergeClearanceRoutes(),
    obstacles: [],
    colorMap: {},
    layerCount: 2,
    connMap: new ConnectivityMap({
      power: ["left", "diagonal"],
      signal: ["neighbor"],
    }),
  }
  const topology = new SameNetViaMergerSolver(input)
  topology.solve()
  expect(topology.mergedViaHdRoutes[1]!.vias).toEqual([{ x: -0.1, y: 0 }])
  const cleanup = new SameNetViaMergerSolver({ ...input, traceMargin: 0.1 })
  const original = structuredClone(cleanup.mergedViaHdRoutes)
  const proposals = [...cleanup.getClearancePreservingMergeCandidates()]
  expect(proposals.length).toBeGreaterThan(0)
  expect(proposals[0]!.routes[0]!.vias).toEqual([{ x: 0, y: 0 }])
  expect(cleanup.mergedViaHdRoutes).toEqual(original)
  expect(input.inputHdRoutes).toEqual(original)
  expect(cleanup.solved).toBe(false)
})
