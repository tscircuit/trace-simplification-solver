import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import {
  createViaMergeClearanceInput,
  createViaMergeClearanceRoutes,
} from "tests/fixtures/via-merge-clearance-routes"

test("successive merge groups use committed copper and refresh the collision index", () => {
  const input = createViaMergeClearanceInput()
  const second = createViaMergeClearanceRoutes().map((route) => ({
    ...route,
    connectionName: `${route.connectionName}_second`,
    route: route.route.map((point) => ({ ...point, x: point.x + 4 })),
    vias: route.vias.map((via) => ({ ...via, x: via.x + 4 })),
  }))
  input.inputHdRoutes.push(...second)
  input.connMap = new ConnectivityMap({
    first: ["left", "diagonal"],
    signal: ["neighbor"],
    second: ["left_second", "diagonal_second"],
    signal2: ["neighbor_second"],
  })
  const solver = new SameNetViaMergerSolver(input)
  // This point is inside the first barrel's old copper, outside its new copper,
  // and above the attached wire. A stale index would retain the old barrel here.
  const probe = { x: -0.2, y: 0.08, z: 0 }
  expect(
    solver.hdRouteSHI.getConflictingRoutesForSegment(probe, probe, 0),
  ).toHaveLength(1)
  solver.step()
  const first = structuredClone(solver.getMergedViaHdRoutes()!.slice(0, 3))
  expect(solver.stats.mergedViaGroups).toBe(1)
  expect(
    solver.hdRouteSHI.getConflictingRoutesForSegment(probe, probe, 0),
  ).toHaveLength(0)
  for (const candidate of solver.getClearancePreservingMergeCandidates()) {
    expect(candidate.routes.slice(0, 3)).toEqual(first)
  }
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.stats.mergedViaGroups).toBe(2)
  expect(solver.getMergedViaHdRoutes()!.slice(0, 3)).toEqual(first)
  expect(solver.getMergedViaHdRoutes()![3]!.vias).toEqual([{ x: 4, y: 0 }])
})
