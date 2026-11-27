import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5, type HighDensityRoute } from "../../index"
import { getSvgFromGraphicsObject } from "graphics-debug"
import fixture from "../fixtures/h616-existing-barrel-transition.json"

test("path simplification preserves an existing DDR barrel transition", (): void => {
  const inputRoute = fixture.inputRoute as HighDensityRoute
  const before = structuredClone(inputRoute)
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: fixture.otherHdRoutes as HighDensityRoute[],
    obstacles: [],
    connMap: new ConnectivityMap(fixture.connMap),
    colorMap: {},
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  const output = solver.simplifiedRoute
  const graphics = solver.visualize()
  graphics.texts = [
    {
      x: -11.5,
      y: 17,
      text: `New drills: ${output.vias.length}`,
      fontSize: 0.18,
    },
  ]
  expect(
    getSvgFromGraphicsObject(graphics, {
      backgroundColor: "white",
      svgWidth: 900,
      svgHeight: 600,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
  const originalTransition = inputRoute.route.find(
    (point) => point.toNextSegmentType,
  )
  expect(originalTransition).toBeDefined()
  expect(output.route.find((point) => point.toNextSegmentType)).toMatchObject({
    x: originalTransition!.x,
    y: originalTransition!.y,
    z: originalTransition!.z,
    toNextSegmentType: originalTransition!.toNextSegmentType,
  })
  expect(output.vias).toEqual(inputRoute.vias)
  expect(inputRoute).toEqual(before)
})
