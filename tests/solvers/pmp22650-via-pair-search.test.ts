import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { HighDensityRouteSpatialIndex } from "lib/data-structures/HighDensityRouteSpatialIndex"
import { ObstacleSpatialHashIndex } from "lib/data-structures/ObstacleTree"
import { SingleRouteUselessViaRemovalSolver } from "lib/solvers/UselessViaRemovalSolver/SingleRouteUselessViaRemovalSolver"
import { breakRouteIntoSections } from "lib/solvers/UselessViaRemovalSolver/break-route-into-sections"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"
import { createObjectsWithZLayers } from "lib/utils/createObjectsWithZLayers"

type Pmp22650ViaPairFixture = {
  source: {
    board: string
    dataset: string
  }
  config: {
    inputRoute: HighDensityRoute
    otherHdRoutes: HighDensityRoute[]
    obstacles: Obstacle[]
    connMap: Record<string, string[]>
    outline: Array<{ x: number; y: number }>
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
) as Pmp22650ViaPairFixture

test("reproduces the dense PMP22650 via-pair search", () => {
  const connectionName = "source_net_altium_pcb_289"
  const inputRoute = fixture.config.otherHdRoutes.find(
    (route) => route.connectionName === connectionName,
  )
  expect(inputRoute).toBeDefined()
  if (!inputRoute) throw new Error(`Missing ${connectionName} in fixture`)

  const routeSections = breakRouteIntoSections(inputRoute)
  const maximumAnchorPairCount = Math.max(
    ...routeSections.slice(1, -1).map((_, sectionIndex) => {
      const previousSection = routeSections[sectionIndex]
      const nextSection = routeSections[sectionIndex + 2]
      return previousSection.z === nextSection.z
        ? previousSection.points.length * nextSection.points.length
        : 0
    }),
  )
  expect(maximumAnchorPairCount).toBe(368_504)

  const allRoutes = [fixture.config.inputRoute, ...fixture.config.otherHdRoutes]
  const solver = new SingleRouteUselessViaRemovalSolver({
    obstacleSHI: new ObstacleSpatialHashIndex(
      "flatbush",
      createObjectsWithZLayers(fixture.config.obstacles, 8),
    ),
    hdRouteSHI: new HighDensityRouteSpatialIndex(allRoutes),
    unsimplifiedRoute: structuredClone(inputRoute),
    connMap: new ConnectivityMap(fixture.config.connMap),
    outline: fixture.config.outline,
    enableObstacleDetourShortcuts: true,
  })

  const graphics = solver.visualize()
  const focusBounds = {
    minX: 156,
    maxX: 162,
    minY: 93,
    maxY: 100,
  }
  graphics.lines = graphics.lines?.filter((line) =>
    line.points.some(
      (point) =>
        point.x >= focusBounds.minX &&
        point.x <= focusBounds.maxX &&
        point.y >= focusBounds.minY &&
        point.y <= focusBounds.maxY,
    ),
  )

  expect(
    getSvgFromGraphicsObject(graphics, {
      backgroundColor: "#0d1b2a",
      svgWidth: 1200,
      svgHeight: 800,
      hideInlineLabels: true,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
}, 120_000)
