import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import { MultiSimplifiedPathSolver } from "../../lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

const signal: HighDensityRoute = {
  connectionName: "signal",
  traceThickness: 0.16,
  viaDiameter: 0.6,
  vias: [],
  route: [
    { x: -3, y: 0, z: 0 },
    { x: -2, y: -1, z: 0 },
    { x: 2, y: -1, z: 0 },
    { x: 3, y: 0, z: 0 },
  ],
}

test("simplifying a legal detour preserves clearance to a non-plated hole", () => {
  const center = { x: 0, y: 0.65 }
  const radius = 0.4
  const solver = new MultiSimplifiedPathSolver({
    unsimplifiedHdRoutes: [signal],
    obstacles: [
      {
        type: "rect",
        shape: "circle",
        center,
        width: 2 * radius,
        height: 2 * radius,
        layers: ["top"],
        connectedTo: [],
        isNonPlatedHole: true,
      },
    ],
    minTraceToHoleEdgeClearance: 0.2,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  const points = solver.simplifiedHdRoutes[0]!.route
  const gap =
    Math.min(
      ...points
        .slice(1)
        .map((p, i) => pointToSegmentDistance(center, points[i]!, p)),
    ) -
    radius -
    signal.traceThickness / 2
  expect(gap).toBeGreaterThanOrEqual(0.2)
})
