import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"
import { stackSvgsHorizontally } from "stack-svgs"
import buggyOutput from "tests/fixtures/mixed-via-buggy-output.json"
import { createMixedViaVisualInput } from "tests/fixtures/mixed-via-visual-input"

// Captured by solving createMixedViaVisualInput() on main commit 404f2ab.
// Missing per-via metadata uses the consumer's 0.6 mm pad / 0.3 mm drill defaults.
const renderRoute = (route: HighDensityRoute, title: string): string => {
  const graphics: GraphicsObject = {
    lines: [],
    circles: [],
    rects: [{ center: { x: 3, y: 0 }, width: 0.5, height: 4, fill: "#eeeeee" }],
    texts: [{ x: 3, y: 2.5, text: title, fontSize: 0.3 }],
  }
  for (let index = 1; index < route.route.length; index++) {
    const start = route.route[index - 1]!
    const end = route.route[index]!
    if (start.z !== end.z) continue
    graphics.lines!.push({
      points: [start, end],
      strokeWidth: route.traceThickness,
      strokeColor: start.z === 0 ? "red" : "blue",
    })
  }
  for (const via of route.vias) {
    const pad = via.diameter ?? route.viaDiameter
    const drill = via.holeDiameter ?? 0.3
    graphics.circles!.push(
      { center: via, radius: pad / 2, fill: "blue" },
      { center: via, radius: drill / 2, fill: "white" },
    )
    graphics.texts!.push({
      x: via.x,
      y: -0.9,
      text: `${pad.toFixed(1)} / ${drill.toFixed(1)} mm`,
      fontSize: 0.22,
    })
  }
  return getSvgFromGraphicsObject(graphics, {
    backgroundColor: "white",
    svgWidth: 600,
    svgHeight: 450,
  })
}

test("mixed vias retain their dimensions while the wire detour is shortened", async () => {
  const input = createMixedViaVisualInput()
  const solver = new TraceSimplificationSolver(input)
  solver.solve()
  const output = solver.simplifiedHdRoutes[0]!
  expect(solver.failed).toBe(false)
  expect(output.vias).toEqual(input.hdRoutes[0]!.vias)
  expect(output.route.length).toBeLessThan(input.hdRoutes[0]!.route.length)
  expect(output.route.every((point) => point.y === 0)).toBe(true)
  expect(output.route).toEqual(buggyOutput.route)
  await expect(
    stackSvgsHorizontally([
      renderRoute(buggyOutput, "BUGGY OUTPUT — main 404f2ab"),
      renderRoute(output, "FIXED OUTPUT — sizes preserved"),
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
