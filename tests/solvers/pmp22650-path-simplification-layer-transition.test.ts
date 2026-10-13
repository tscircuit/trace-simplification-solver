import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
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
    outline: Array<{ x: number; y: number }>
    minBoardEdgeClearance: number
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

const getFocusedRouteGraphics = ({
  inputRoute,
  outputRoute,
}: {
  inputRoute: HighDensityRoute
  outputRoute: HighDensityRoute
}): GraphicsObject => {
  const lines: NonNullable<GraphicsObject["lines"]> = []
  const circles: NonNullable<GraphicsObject["circles"]> = []

  for (let index = 1; index < inputRoute.route.length; index++) {
    const start = inputRoute.route[index - 1]
    const end = inputRoute.route[index]
    if (!isInsideFocus(start) && !isInsideFocus(end)) continue
    if (start.z !== end.z) continue
    lines.push({
      points: [start, end],
      strokeColor: "rgba(148, 163, 184, 0.45)",
      strokeWidth: 0.08,
      strokeDash: [0.08, 0.08],
    })
  }

  for (let index = 1; index < outputRoute.route.length; index++) {
    const start = outputRoute.route[index - 1]
    const end = outputRoute.route[index]
    if (!isInsideFocus(start) && !isInsideFocus(end)) continue
    if (start.z === end.z) {
      lines.push({
        points: [start, end],
        strokeColor: start.z === 0 ? "#ef4444" : "#3b82f6",
        strokeWidth: outputRoute.traceThickness,
      })
      continue
    }
    if (start.x === end.x && start.y === end.y) {
      circles.push({
        center: start,
        radius: outputRoute.viaDiameter / 2,
        fill: "#ec4899",
      })
      continue
    }
    lines.push({
      points: [start, end],
      strokeColor: "#f59e0b",
      strokeWidth: outputRoute.traceThickness * 2,
    })
  }

  return {
    coordinateSystem: "cartesian",
    title: "PMP22650 path simplification layer transition",
    lines,
    circles,
    rects: [],
    points: [],
  }
}

test("preserves PMP22650 layer transitions during path simplification", () => {
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute: fixture.config.inputRoute,
    otherHdRoutes: fixture.config.otherHdRoutes,
    obstacles: fixture.config.obstacles,
    connMap: new ConnectivityMap(fixture.config.connMap),
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
  expect(invalidLayerTransitions).toEqual([])

  expect(
    getSvgFromGraphicsObject(
      getFocusedRouteGraphics({
        inputRoute: fixture.config.inputRoute,
        outputRoute: solver.simplifiedRoute,
      }),
      {
        backgroundColor: "#0d1b2a",
        svgWidth: 1200,
        svgHeight: 700,
        hideInlineLabels: true,
      },
    ),
  ).toMatchSvgSnapshot(import.meta.path)
}, 120_000)
