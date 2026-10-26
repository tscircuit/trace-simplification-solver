import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { MultiSimplifiedPathSolver } from "../../lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"

test("path simplification reports a failed nested search instead of polling it forever", (): void => {
  const solver = new MultiSimplifiedPathSolver({ unsimplifiedHdRoutes: [{ connectionName: "route", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }], vias: [] }], obstacles: [], connMap: new ConnectivityMap({}) })
  solver.step()
  const child = solver.activeSubSolver!
  child.MAX_ITERATIONS = 0
  solver.step()
  expect(child.failed).toBe(true)
  expect(solver.failed).toBe(true)
  expect(solver.solved).toBe(false)
  expect(solver.error).toBe(child.error)
  expect(solver.iterations).toBe(2)
  const childIterations = child.iterations
  solver.step()
  expect(child.iterations).toBe(childIterations)
  expect(solver.simplifiedHdRoutes).toEqual([])
})
