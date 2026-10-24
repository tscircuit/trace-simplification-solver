import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { UselessViaRemovalSolver } from "lib/solvers/UselessViaRemovalSolver/UselessViaRemovalSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

type SerializedConfig = Omit<
  ConstructorParameters<typeof UselessViaRemovalSolver>[0],
  "connMap" | "terminalLayerIndicesByPcbPortId"
> & {
  connMap: Record<string, string[]>
  terminalLayerIndicesByPcbPortId: Array<[string, number[]]>
  enableRoutedTraceDetours: boolean
}

type SampleFixture = {
  source: {
    dataset: string
    sample: number
    datasetRevision: string
    captureBoundary: string
    routeCaptureSha256: string
    configSha256: string
    focusConnectionName: string
  }
  config: SerializedConfig
}

test("SRJ18 sample 2 routed-copper vias", async (): Promise<void> => {
  const fixture = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "../fixtures/srj18-sample2/via-removal-input.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  ) as SampleFixture
  expect(fixture.source.dataset).toBe("srj18")
  expect(fixture.source.sample).toBe(2)
  expect(
    createHash("sha256").update(JSON.stringify(fixture.config)).digest("hex"),
  ).toBe(fixture.source.configSha256)

  const { connMap, terminalLayerIndicesByPcbPortId, ...config } =
    structuredClone(fixture.config)
  const terminalLayers = new Map<string, ReadonlySet<number>>()
  for (const [id, layers] of terminalLayerIndicesByPcbPortId) {
    terminalLayers.set(id, new Set(layers))
  }
  const inputByName = new Map<string, HighDensityRoute>()
  let inputViaCount = 0
  for (const route of config.unsimplifiedHdRoutes) {
    inputByName.set(route.connectionName, structuredClone(route))
    inputViaCount += route.vias.length
  }
  expect(inputByName.size).toBe(244)
  expect(inputViaCount).toBe(548)

  const solver = new UselessViaRemovalSolver({
    ...config,
    connMap: new ConnectivityMap(connMap),
    terminalLayerIndicesByPcbPortId: terminalLayers,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const output = solver.getOptimizedHdRoutes()
  if (!output) throw new Error("Via removal has no output")
  expect(output.length).toBe(inputByName.size)
  let viaCount = 0
  for (const route of output) {
    const input = inputByName.get(route.connectionName)!
    viaCount += route.vias.length
    expect(route.startPcbPortId).toBe(input.startPcbPortId)
    expect(route.endPcbPortId).toBe(input.endPcbPortId)
    expect(route.route[0]).toMatchObject({
      x: input.route[0]!.x,
      y: input.route[0]!.y,
    })
    expect(route.route.at(-1)).toMatchObject({
      x: input.route.at(-1)!.x,
      y: input.route.at(-1)!.y,
    })
  }
  // Routed-copper detours and layer-aware pad clearance remove 46 vias.
  expect(viaCount).toBe(502)
  const focusInput = inputByName.get(fixture.source.focusConnectionName)!
  const focusOutput = output.find(
    (route) => route.connectionName === fixture.source.focusConnectionName,
  )!
  expect(focusOutput.vias.length).toBe(2)

  const graphics = solver.visualize()
  const focusGraphics = {
    ...graphics,
    lines: graphics.lines!.filter((line) =>
      line.label?.startsWith(`${fixture.source.focusConnectionName} (`),
    ),
    circles: graphics.circles!.filter(
      (circle) => circle.label === `${fixture.source.focusConnectionName} via`,
    ),
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of focusInput.route) {
    minX = Math.min(minX, point.x - 2)
    maxX = Math.max(maxX, point.x + 2)
    minY = Math.min(minY, point.y - 2)
    maxY = Math.max(maxY, point.y + 2)
  }
  focusGraphics.rects = graphics.rects!.filter(
    (rect) =>
      rect.center.x >= minX &&
      rect.center.x <= maxX &&
      rect.center.y >= minY &&
      rect.center.y <= maxY,
  )
  for (const view of [graphics, focusGraphics]) {
    for (const line of view.lines ?? []) {
      if (line.label?.endsWith("(z=1)")) {
        line.strokeDash = [4, 3]
        line.strokeColor = "rgba(0, 0, 255, 0.6)"
      }
      delete line.label
    }
    for (const rect of view.rects ?? []) delete rect.label
    for (const circle of view.circles ?? []) {
      circle.fill = "blue"
      delete circle.label
    }
  }
  await expect(
    getSvgFromGraphicsObject(graphics, {
      backgroundColor: "white",
      svgWidth: 1600,
      svgHeight: 1000,
      hideInlineLabels: true,
    }),
  ).toMatchSvgSnapshot(import.meta.path, { svgName: "board", scale: 1 })
  await expect(
    getSvgFromGraphicsObject(focusGraphics, {
      backgroundColor: "white",
      svgWidth: 1600,
      svgHeight: 600,
      hideInlineLabels: true,
    }),
  ).toMatchSvgSnapshot(import.meta.path, {
    svgName: "most-improved-net",
    scale: 1,
  })
})
