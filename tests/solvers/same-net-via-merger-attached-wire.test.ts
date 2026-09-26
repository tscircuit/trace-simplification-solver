import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"
import {
  createClearanceFrames,
  copperGap,
  renderClearanceComparison,
} from "tests/fixtures/via-merge-clearance-visual"

test("rejects the merge that bends an attached wire into another net's clearance", async () => {
  const frames = createClearanceFrames()
  expect(copperGap(frames[0]!.routes)).toBeGreaterThan(0.1)
  expect(copperGap(frames[1]!.routes)).toBeLessThan(0.1)
  expect(copperGap(frames[2]!.routes)).toBeGreaterThan(0.1)
  expect(frames[2]!.routes.flatMap((r) => r.vias)).toEqual([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ])
  await expect(renderClearanceComparison(frames)).toMatchSvgSnapshot(
    import.meta.path,
    { scale: 1 },
  )
})

test.each([0, 1])(
  "checks attached wires on layer %s and leaves a blocked merge unchanged",
  (z) => {
    const [anchor, diagonal, neighbor] = createViaMergeClearanceRoutes()
    for (const point of neighbor!.route) point.z = z
    const input = structuredClone([anchor, diagonal, neighbor])
    const solver = new SameNetViaMergerSolver({
      inputHdRoutes: [diagonal!],
      otherHdRoutes: [anchor!, neighbor!],
      obstacles: [],
      colorMap: {},
      layerCount: 2,
      traceMargin: 0.1,
      connMap: new ConnectivityMap({
        power: ["left", "diagonal"],
        signal: ["neighbor"],
      }),
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.getMergedViaHdRoutes()).toEqual([diagonal!])
    expect([anchor, diagonal, neighbor]).toEqual(input)
  },
)
