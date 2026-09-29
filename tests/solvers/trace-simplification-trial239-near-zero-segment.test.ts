import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

const MIN_SAME_LAYER_SEGMENT_LENGTH = 1e-4

type TraceSimplificationConfig = ConstructorParameters<
  typeof TraceSimplificationSolver
>[0]

type SerializedTraceSimplificationConfig = Omit<
  TraceSimplificationConfig,
  "connMap" | "netByConnectionName" | "terminalLayerIndicesByPcbPortId"
> & {
  connMap: Record<string, string[]>
  netByConnectionName?: Array<[string, string]>
  terminalLayerIndicesByPcbPortId?: Array<[string, number[]]>
}

type Trial239Fixture = {
  source: {
    board: string
    eventFile: string
    eventFileSha256: string
    router: string
    routerVersion: string
    traceSimplificationSolverRevision: string
    captureBoundary: string
    boardTsxSha256: string
    boardCircuitJsonSha256: string
    reproducedOnTraceSimplificationSolverRevision: string
    targetConnectionName: string
    configSha256: string
  }
  config: SerializedTraceSimplificationConfig
}

const fixtureJson = gunzipSync(
  readFileSync(
    new URL(
      "../fixtures/bug-reports/trial239-near-zero-segment/trace-simplification-input.json.gz",
      import.meta.url,
    ),
  ),
).toString("utf8")
const fixture = JSON.parse(fixtureJson) as Trial239Fixture

const getPositiveSameLayerSegments = (route: HighDensityRoute) =>
  route.route.slice(1).flatMap((point, index) => {
    const previousPoint = route.route[index]!
    if (previousPoint.z !== point.z) return []

    const length = Math.hypot(
      point.x - previousPoint.x,
      point.y - previousPoint.y,
    )
    if (length === 0) return []

    return [{ index, start: previousPoint, end: point, length }]
  })

test("captures the exact Trial239 near-zero segment", async () => {
  const {
    connMap,
    netByConnectionName,
    terminalLayerIndicesByPcbPortId,
    ...config
  } = fixture.config
  expect(
    createHash("sha256").update(JSON.stringify(fixture.config)).digest("hex"),
  ).toBe(fixture.source.configSha256)
  const inputTargetRoute = config.hdRoutes.find(
    (route) => route.connectionName === fixture.source.targetConnectionName,
  )

  expect(inputTargetRoute).toBeDefined()
  expect(
    Math.min(
      ...getPositiveSameLayerSegments(inputTargetRoute!).map((s) => s.length),
    ),
  ).toBeCloseTo(0.014, 10)

  const solver = new TraceSimplificationSolver({
    ...config,
    connMap: new ConnectivityMap(connMap),
    netByConnectionName: netByConnectionName
      ? new Map(netByConnectionName)
      : undefined,
    terminalLayerIndicesByPcbPortId: terminalLayerIndicesByPcbPortId
      ? new Map(
          terminalLayerIndicesByPcbPortId.map(([pcbPortId, layers]) => [
            pcbPortId,
            new Set(layers),
          ]),
        )
      : undefined,
  })

  // Trial239 ran Pipeline9 at effort 2, which doubled its two base loops.
  solver.MAX_SIMPLIFICATION_PIPELINE_LOOPS = 4
  solver.solve()

  expect(solver.failed).toBeFalse()
  const outputTargetRoute = solver.simplifiedHdRoutes.find(
    (route) => route.connectionName === fixture.source.targetConnectionName,
  )
  expect(outputTargetRoute).toBeDefined()

  const nearZeroSegments = getPositiveSameLayerSegments(
    outputTargetRoute!,
  ).filter((segment) => segment.length < MIN_SAME_LAYER_SEGMENT_LENGTH)
  expect(nearZeroSegments).toEqual([
    {
      index: 5,
      start: {
        x: 5.010898489404214,
        y: -25.99054633082335,
        z: 2,
      },
      end: {
        x: 5.010936336969285,
        y: -25.99054633082335,
        z: 2,
      },
      length: 3.7847565071302824e-5,
    },
  ])

  const graphics = solver.visualize()
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
