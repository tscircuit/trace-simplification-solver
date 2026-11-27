import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import fixture from "tests/fixtures/h616-short-bend.json"

test("fallback preserves short bends between two fixed barrels", () => {
  const before = structuredClone(fixture)
  const solver = new SingleSimplifiedPathSolver5({
    ...fixture,
    obstacles: fixture.obstacles as Obstacle[],
    connMap: new ConnectivityMap({}),
    colorMap: {},
    useTraceWidthAwareClearance: true,
  })
  solver.solve()
  expect(solver.solved).toBeTrue()
  const output = solver.simplifiedRoute
  const via = fixture.otherHdRoutes[0]!
  const gap =
    Math.min(
      ...output.route
        .slice(1)
        .map((end, index) =>
          pointToSegmentDistance(via.vias[0]!, output.route[index]!, end),
        ),
    ) -
    via.viaDiameter / 2 -
    output.traceThickness / 2
  expect(gap).toBeGreaterThanOrEqual(0.1 - 1e-9)
  expect(output.route[0]).toEqual(fixture.inputRoute.route[0])
  expect(output.route.at(-1)).toEqual(fixture.inputRoute.route.at(-1))
  expect(fixture).toEqual(before)
  expect(
    getSvgFromGraphicsObject(solver.visualize(), {
      svgWidth: 800,
      svgHeight: 480,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
