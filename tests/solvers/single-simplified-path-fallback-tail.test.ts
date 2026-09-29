import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "lib/types/high-density-types"
import { stackSvgsHorizontally } from "stack-svgs"

const BLOCKER_CENTER = { x: -0.35, y: 0 }
const BLOCKER_RADIUS = 0.225
const BLOCKER_CLEARANCE_RADIUS = 0.4

const createSolver = (fallbackVertexX: number) => {
  const inputRoute: HighDensityRoute = {
    connectionName: "target",
    traceThickness: 0.1,
    viaDiameter: 0.45,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: fallbackVertexX, y: 0, z: 0 },
      { x: 1, y: 0.5, z: 0 },
    ],
    vias: [],
  }
  const blockingRoute: HighDensityRoute = {
    connectionName: "blocker",
    traceThickness: 0.1,
    viaDiameter: BLOCKER_RADIUS * 2,
    route: [{ ...BLOCKER_CENTER, z: 0 }],
    vias: [BLOCKER_CENTER],
  }
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute,
    otherHdRoutes: [blockingRoute],
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
  })

  solver.solve()
  expect(solver.failed).toBeFalse()

  return { inputRoute, blockingRoute, solver }
}

const getPositiveSegments = (route: HighDensityRoute) =>
  route.route.slice(1).flatMap((end, index) => {
    const start = route.route[index]!
    if (start.z !== end.z) return []
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    return length > 0 ? [{ start, end, length }] : []
  })

const addPanelHeader = ({
  svg,
  title,
  details,
}: {
  svg: string
  title: string
  details: [string, string]
}): string => {
  const headerHeight = 76
  const bodyStart = svg.indexOf(">") + 1
  const bodyEnd = svg.lastIndexOf("</svg>")
  const width = Number(svg.match(/\bwidth="([^"]+)"/)?.[1] ?? 600)
  const height = Number(svg.match(/\bheight="([^"]+)"/)?.[1] ?? 440)
  return `<svg width="${width}" height="${
    height + headerHeight
  }" viewBox="0 0 ${width} ${
    height + headerHeight
  }" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="16" y="22" font-family="monospace" font-size="15" font-weight="700" fill="#111">${title}</text><text x="16" y="43" font-family="monospace" font-size="12" fill="#444">${details[0]}</text><text x="16" y="61" font-family="monospace" font-size="12" fill="#444">${details[1]}</text><g transform="translate(0 ${headerHeight})">${svg.slice(
    bodyStart,
    bodyEnd,
  )}</g></svg>`
}

const getRouteLines = (
  route: HighDensityRoute,
  options: {
    strokeColor: string
    strokeWidth: number
    strokeDash?: number[]
    shortSegmentColor?: string
  },
): NonNullable<GraphicsObject["lines"]> =>
  getPositiveSegments(route).map((segment) => ({
    points: [segment.start, segment.end],
    strokeColor:
      options.shortSegmentColor && segment.length < 0.1
        ? options.shortSegmentColor
        : options.strokeColor,
    strokeWidth:
      options.shortSegmentColor && segment.length < 0.1
        ? options.strokeWidth * 2
        : options.strokeWidth,
    strokeDash: options.strokeDash,
  }))

const getBlockerGraphics = (): Pick<GraphicsObject, "circles" | "points"> => ({
  circles: [
    {
      center: BLOCKER_CENTER,
      radius: BLOCKER_CLEARANCE_RADIUS,
      fill: "rgba(239, 68, 68, 0.10)",
      stroke: "rgba(239, 68, 68, 0.55)",
    },
    {
      center: BLOCKER_CENTER,
      radius: BLOCKER_RADIUS,
      fill: "rgba(126, 34, 206, 0.65)",
      stroke: "rgb(88, 28, 135)",
    },
  ],
  points: [
    {
      ...BLOCKER_CENTER,
      color: "rgb(88, 28, 135)",
      label: "blocking via",
    },
  ],
})

const renderPanel = (graphics: GraphicsObject) =>
  getSvgFromGraphicsObject(graphics, {
    backgroundColor: "#f8fafc",
    svgWidth: 600,
    svgHeight: 440,
    includeTextLabels: ["points"],
    hideInlineLabels: true,
  })

test("keeps the next path aligned with the appended fallback vertex", () => {
  const { solver } = createSolver(0.24996)
  const nearZeroSegments = getPositiveSegments(solver.simplifiedRoute).filter(
    (segment) => segment.length < 1e-4,
  )

  expect(nearZeroSegments).toEqual([])
})

test("visualizes the fallback-tail transition", () => {
  // Use a larger fallback offset so any mismatch is visible at normal SVG scale.
  const { inputRoute, solver } = createSolver(0.2)
  const outputRoute = solver.simplifiedRoute
  const staleJoin = getPositiveSegments(outputRoute).find(
    (segment) => segment.length < 0.1,
  )

  expect(staleJoin).toBeUndefined()

  const blockerGraphics = getBlockerGraphics()
  const inputGraphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    lines: getRouteLines(inputRoute, {
      strokeColor: "rgba(220, 38, 38, 0.75)",
      strokeWidth: 0.018,
      strokeDash: [0.025, 0.025],
    }),
    circles: blockerGraphics.circles,
    points: [
      ...blockerGraphics.points!,
      ...inputRoute.route.map((point, index) => ({
        ...point,
        color: "rgb(220, 38, 38)",
        label: index === 1 ? "fallback vertex B" : undefined,
      })),
    ],
  }
  const outputGraphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    lines: [
      ...getRouteLines(inputRoute, {
        strokeColor: "rgba(100, 116, 139, 0.35)",
        strokeWidth: 0.012,
        strokeDash: [0.025, 0.025],
      }),
      ...getRouteLines(outputRoute, {
        strokeColor: "rgb(22, 163, 74)",
        strokeWidth: 0.022,
        shortSegmentColor: "rgb(219, 39, 119)",
      }),
    ],
    circles: blockerGraphics.circles,
    points: [
      ...blockerGraphics.points!,
      ...outputRoute.route.map((point) => ({
        ...point,
        color: "rgb(22, 163, 74)",
        label: point === staleJoin?.end ? "stale tail at 0.25 mm" : undefined,
      })),
    ],
  }

  expect(
    stackSvgsHorizontally(
      [
        addPanelHeader({
          svg: renderPanel(inputGraphics),
          title: "INPUT • 3 ROUTE POINTS + 1 BLOCKING VIA",
          details: [
            "Fallback advances 0.25 mm; vertex B is at 0.20 mm.",
            "The via rejects candidate paths starting at A.",
          ],
        }),
        addPanelHeader({
          svg: renderPanel(outputGraphics),
          title: staleJoin
            ? "OUTPUT • STALE TAIL JOIN"
            : "OUTPUT • FALLBACK VERTEX ALIGNED",
          details: staleJoin
            ? [
                `B → stale tail = ${staleJoin.length.toFixed(6)} mm (magenta).`,
                "That join was never checked by the path validator.",
              ]
            : [
                "The next validated path starts exactly at vertex B.",
                "No stale interpolated-tail join is emitted.",
              ],
        }),
      ],
      { gap: 12, normalizeSize: false },
    ),
  ).toMatchSvgSnapshot(import.meta.path)
})
