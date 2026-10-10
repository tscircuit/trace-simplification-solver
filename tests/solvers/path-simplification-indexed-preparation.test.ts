import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { PathSimplificationGeometryIndex } from "lib/data-structures/PathSimplificationGeometryIndex"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

function preparedGeometry(solver: SingleSimplifiedPathSolver5): unknown {
  return {
    obstacles: solver.filteredObstacles,
    segments: solver.filteredObstaclePathSegments,
    vias: solver.filteredVias,
    pads: solver.filteredJumperPads,
    thicknesses: [...solver.traceThicknessByObstacleSegmentId],
    buckets: [...solver.segmentTree.buckets],
  }
}

test("indexed preparation exactly matches full scans across widths, layers and live replacements", (): void => {
  const mutableRoutes: HighDensityRoute[] = Array.from(
    { length: 48 },
    (_, index) => {
      const x = (index % 8) - 4
      const y = Math.floor(index / 8) - 3
      return {
        connectionName: `route${index % 24}`,
        rootConnectionName: `root${index % 6}`,
        traceThickness: 0.05 + (index % 5) * 0.3,
        viaDiameter: 0.1 + (index % 4) * 0.4,
        route: [
          { x, y, z: index % 3, traceThickness: 0.1 },
          {
            x: x + 0.75,
            y: y + 0.25,
            z: index % 3,
            insideJumperPad: index % 7 === 0,
          },
          {
            x: x + 0.75,
            y: y + 0.25,
            z: (index + 1) % 3,
            toNextSegmentType: "through_obstacle",
            toNextSegmentCircuitJsonMetadata: { pcb_via_id: `via${index}` },
          },
          { x: x + 1.5, y: y + 0.5, z: (index + 1) % 3, traceThickness: 2 },
        ],
        vias: [{ x: x + 0.75, y: y + 0.25 }],
        ...(index % 7 === 0
          ? {
              jumpers: [
                {
                  route_type: "jumper" as const,
                  start: { x: x + 2, y },
                  end: { x: x + 2, y: y + 1 },
                  footprint: "1206" as const,
                },
              ],
            }
          : {}),
      }
    },
  )
  const immutableRoutes: HighDensityRoute[] = mutableRoutes
    .slice(0, 12)
    .map((route, index) => ({
      ...route,
      connectionName: `immutable${index}`,
      route: route.route.map((point) => ({ ...point, x: point.x + 0.5 })),
    }))
  const obstacles: Obstacle[] = Array.from({ length: 64 }, (_, index) => ({
    type: "rect",
    layers: ["top", "bottom"],
    __zLayers: [index % 3],
    center: { x: (index % 8) - 4.25, y: Math.floor(index / 8) - 3.25 },
    width: 0.1 + (index % 5) * 0.15,
    height: 0.2 + (index % 3) * 0.2,
    connectedTo: [`root${index % 6}`],
    circuitJsonMetadata: { pcb_smtpad_id: `pad${index}` },
  }))
  const connMap = new ConnectivityMap(
    Object.fromEntries(
      Array.from({ length: 6 }, (_, root) => [
        `net${root}`,
        [
          `root${root}`,
          ...mutableRoutes
            .filter((_, index) => index % 6 === root)
            .map((route) => route.connectionName),
        ],
      ]),
    ),
  )
  for (const useTraceWidthAwareClearance of [false, true]) {
    const routes = structuredClone(mutableRoutes)
    const geometryIndex = new PathSimplificationGeometryIndex(
      routes,
      immutableRoutes,
      obstacles,
    )
    for (let index = 0; index < routes.length; index++) {
      const otherHdRoutes = immutableRoutes.concat(
        routes.slice(index + 1),
        routes.slice(0, index),
      )
      const params = {
        inputRoute: routes[index],
        otherHdRoutes,
        obstacles,
        connMap,
        colorMap: {},
        useTraceWidthAwareClearance,
      }
      const reference = new SingleSimplifiedPathSolver5(params)
      const indexed = new SingleSimplifiedPathSolver5({
        ...params,
        geometryQuery: { index: geometryIndex, routeIndex: index },
      })
      expect(preparedGeometry(indexed)).toEqual(preparedGeometry(reference))
      expect(indexed.otherHdRoutes).toBe(otherHdRoutes)
      expect(indexed.obstacles).toBe(obstacles)
      for (const point of routes[index].route) {
        const end = { ...point, x: point.x + 1.25, y: point.y - 0.25 }
        expect(indexed.isValidPathSegment(point, end)).toBe(
          reference.isValidPathSegment(point, end),
        )
      }
      // Replacement changes both membership and geometry seen by later routes.
      const replacement = {
        ...routes[index],
        route: routes[index].route.map((point) => ({
          ...point,
          x: point.x + 1.25,
        })),
        vias: routes[index].vias.map((via) => ({ ...via, x: via.x + 1.25 })),
      }
      routes[index] = replacement
      geometryIndex.replaceRoute(index, replacement)
    }
  }
})
