import { expect, test } from "bun:test"
import { MultiSimplifiedPathSolver } from "../../lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"

test("propagates a failed route simplifier instead of repeatedly stepping it", (): void => {
  const solver = new MultiSimplifiedPathSolver({
    unsimplifiedHdRoutes: [{
      connectionName: "route",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }],
      vias: [],
    }],
    obstacles: [],
  })
  solver.step()
  const child = solver.activeSubSolver!
  child.MAX_ITERATIONS = 0
  solver.step()
  expect(child.failed).toBe(true)
  expect(solver.failed).toBe(true)
  expect(solver.solved).toBe(false)
  expect(solver.error).toBe(child.error)
  expect(solver.simplifiedHdRoutes).toEqual([])
})
