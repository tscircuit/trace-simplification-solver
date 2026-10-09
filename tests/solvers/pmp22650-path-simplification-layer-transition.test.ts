import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

type Pmp22650PathSimplificationFixture = {
  source: {
    board: string
    dataset: string
    captureBoundary: string
    targetConnectionName: string
  }
  config: {
    inputRoute: HighDensityRoute
    otherHdRoutes: HighDensityRoute[]
    obstacles: Obstacle[]
    connMap: Record<string, string[]>
    netByConnectionName: Array<[string, string]>
    outline: Array<{ x: number; y: number }>
    minBoardEdgeClearance: number
    defaultViaDiameter: number
  }
}

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "../fixtures/bug-reports/pmp22650-layer-transition/path-simplification-input.json.gz",
        import.meta.url,
      ),
    ),
  ).toString("utf8"),
) as Pmp22650PathSimplificationFixture

test("reproduces the PMP22650 diagonal layer transition", () => {
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute: fixture.config.inputRoute,
    otherHdRoutes: fixture.config.otherHdRoutes,
    obstacles: fixture.config.obstacles,
    connMap: new ConnectivityMap(fixture.config.connMap),
    netByConnectionName: new Map(fixture.config.netByConnectionName),
    colorMap: {},
    outline: fixture.config.outline,
    minBoardEdgeClearance: fixture.config.minBoardEdgeClearance,
  })

  solver.solve()

  expect(solver.failed).toBeFalse()
  const invalidLayerTransitions = solver.simplifiedRoute.route.flatMap(
    (point, index, route) => {
      const previousPoint = route[index - 1]
      if (
        !previousPoint ||
        previousPoint.z === point.z ||
        previousPoint.toNextSegmentType === "through_obstacle" ||
        (previousPoint.x === point.x && previousPoint.y === point.y)
      ) {
        return []
      }
      return [{ previousPoint, point }]
    },
  )
  expect(invalidLayerTransitions).toHaveLength(1)

  const graphics = solver.visualize()
  const focusBounds = {
    minX: 156,
    maxX: 162,
    minY: 93,
    maxY: 100,
  }
  const isInsideFocus = (point: { x: number; y: number }) =>
    point.x >= focusBounds.minX &&
    point.x <= focusBounds.maxX &&
    point.y >= focusBounds.minY &&
    point.y <= focusBounds.maxY
  graphics.lines = graphics.lines?.filter((line) =>
    line.points.some(isInsideFocus),
  )
  graphics.points = graphics.points?.filter(isInsideFocus)
  graphics.circles = graphics.circles?.filter((circle) =>
    isInsideFocus(circle.center),
  )
  graphics.rects = graphics.rects?.filter(
    (rect) =>
      rect.center.x - rect.width / 2 <= focusBounds.maxX &&
      rect.center.x + rect.width / 2 >= focusBounds.minX &&
      rect.center.y - rect.height / 2 <= focusBounds.maxY &&
      rect.center.y + rect.height / 2 >= focusBounds.minY,
  )
  for (const line of graphics.lines ?? []) delete line.label
  for (const point of graphics.points ?? []) delete point.label
  for (const rect of graphics.rects ?? []) delete rect.label
  for (const circle of graphics.circles ?? []) delete circle.label

  expect(
    getSvgFromGraphicsObject(graphics, {
      backgroundColor: "#0d1b2a",
      svgWidth: 1400,
      svgHeight: 900,
      hideInlineLabels: true,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
}, 120_000)
