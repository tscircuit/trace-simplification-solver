import { beforeAll, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "lib/types/high-density-types"
import { stackSvgsHorizontally } from "stack-svgs"

type SerializedConfig = Omit<
  ConstructorParameters<typeof SingleSimplifiedPathSolver5>[0],
  "connMap"
> & { connMap: Record<string, string[]> }

type SampleFixture = {
  source: {
    dataset: string
    sample: number
    configSha256: string
  }
  config: SerializedConfig
}

type LayerChange = {
  start: HighDensityRoute["route"][number]
  end: HighDensityRoute["route"][number]
}

const fixture: SampleFixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "../fixtures/srj18-sample3/path-simplification-input.json.gz",
        import.meta.url,
      ),
    ),
  ).toString("utf8"),
)
const originalConfig = structuredClone(fixture.config)
const { connMap, ...config } = structuredClone(fixture.config)
const solver = new SingleSimplifiedPathSolver5({
  ...config,
  connMap: new ConnectivityMap(connMap),
})

const getInvalidLayerChanges = (route: HighDensityRoute): LayerChange[] =>
  route.route.slice(1).flatMap((end, index) => {
    const start = route.route[index]!
    if (start.z === end.z) return []
    const hasVia = route.vias.some(
      (via) => via.x === start.x && via.y === start.y,
    )
    return start.x === end.x && start.y === end.y && hasVia
      ? []
      : [{ start, end }]
  })

const getRouteSvg = ({
  route,
  title,
}: {
  route: HighDensityRoute
  title: string
}): string => {
  const invalid = getInvalidLayerChanges(route)
  const graphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    title: `${title}: ${route.vias.length} vias, ${invalid.length} invalid layer changes`,
    lines: route.route.slice(1).map((end, index) => {
      const start = route.route[index]!
      return {
        points: [start, end],
        strokeWidth: route.traceThickness,
        strokeColor:
          start.z !== end.z && (start.x !== end.x || start.y !== end.y)
            ? "#db2777"
            : ["#dc2626", "#2563eb", "#16a34a", "#ca8a04"][start.z],
        layer: `z${start.z}`,
      }
    }),
    circles: route.vias.map((via) => ({
      center: via,
      radius: route.viaDiameter / 2,
      fill: "rgba(37, 99, 235, 0.35)",
      stroke: "#2563eb",
    })),
    points: [route.route[0]!, route.route.at(-1)!].map((point) => ({
      ...point,
      label: `z${point.z}`,
      color: "#111827",
    })),
  }
  const svg = getSvgFromGraphicsObject(graphics, {
    backgroundColor: "white",
    svgWidth: 620,
    svgHeight: 620,
    includeTextLabels: ["points"],
  })
  const bodyStart = svg.indexOf(">") + 1
  const bodyEnd = svg.lastIndexOf("</svg>")
  const body = svg.slice(bodyStart, bodyEnd)
  const statusColor = invalid.length ? "#be185d" : "#166534"
  return `<svg width="620" height="672" viewBox="0 0 620 672" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="16" y="21" font-family="monospace" font-size="15" fill="#111827">${title}</text><text x="16" y="42" font-family="monospace" font-size="13" fill="${statusColor}">${route.vias.length} vias · ${invalid.length} invalid layer changes</text><g transform="translate(0 52)">${body}</g></svg>`
}

beforeAll((): void => {
  expect(fixture.source.dataset).toBe("srj18")
  expect(fixture.source.sample).toBe(3)
  expect(
    createHash("sha256").update(JSON.stringify(fixture.config)).digest("hex"),
  ).toBe(fixture.source.configSha256)
  expect(config.inputRoute.route).toHaveLength(13)
  expect(config.inputRoute.vias).toHaveLength(3)
  expect(config.obstacles).toHaveLength(315)
  expect(config.otherHdRoutes).toHaveLength(144)
  expect(getInvalidLayerChanges(config.inputRoute)).toEqual([])
  solver.solve()
  expect(solver.solved).toBeTrue()
  expect(solver.failed).toBeFalse()
  // Drawing only the affected route keeps its missing final via visible;
  // the solver receives every captured obstacle and peer unchanged.
  expect(
    stackSvgsHorizontally(
      [
        getRouteSvg({
          route: config.inputRoute,
          title: "SRJ18 sample 3 input",
        }),
        getRouteSvg({
          route: solver.simplifiedRoute,
          title: "Simplified output",
        }),
      ],
      { gap: 12, normalizeSize: false },
    ),
  ).toMatchSvgSnapshot(import.meta.path)
})

test.failing(
  "preserves SRJ18 sample 3's final via after a blocked path step",
  (): void => {
    const output = solver.simplifiedRoute
    expect(fixture.config).toEqual(originalConfig)
    expect(config.inputRoute).toEqual(originalConfig.inputRoute)
    expect(output.startPcbPortId).toBe(config.inputRoute.startPcbPortId)
    expect(output.endPcbPortId).toBe(config.inputRoute.endPcbPortId)
    for (const index of [0, -1]) {
      const inputPoint = config.inputRoute.route.at(index)!
      expect(output.route.at(index)).toMatchObject({
        x: inputPoint.x,
        y: inputPoint.y,
        z: inputPoint.z,
      })
    }
    expect(getInvalidLayerChanges(output)).toEqual([])
    expect(output.vias).toEqual(config.inputRoute.vias)
  },
)
