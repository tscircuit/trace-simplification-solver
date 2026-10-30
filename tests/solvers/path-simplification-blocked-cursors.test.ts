import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

type ProgressWindow = {
  headDistanceAlongPath: number
  tailDistanceAlongPath: number
}

test("blocked route prefixes keep the progress window ordered", (): void => {
  // Independent synthetic geometry, generated without board data.
  let seed = 18642
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  for (let trial = 0; trial < 9; trial++) {
    const route: HighDensityRoute = {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [{ x: 0, y: 0, z: 0 }],
      vias: [],
    }
    for (let index = 0; index < 15; index++) {
      const last = route.route.at(-1)!
      route.route.push({
        x: last.x + random() * 4,
        y: last.y + (random() - 0.5) * 2,
        z: last.z,
      })
      if (index % 4 === 3) {
        const point = route.route.at(-1)!
        route.vias.push({ x: point.x, y: point.y })
        route.route.push({ ...point, z: 1 - point.z })
      }
    }
    const obstacles = Array.from({ length: 5 }, () => ({
      type: "rect" as const,
      layers: ["top", "bottom"],
      center: { x: random() * 35, y: (random() - 0.5) * 5 },
      width: random() * 2 + 0.1,
      height: random() * 2 + 0.1,
      connectedTo: ["other"],
    }))
    const otherHdRoutes = Array.from({ length: 8 }, (_, index) => {
      const point = { x: random() * 35, y: (random() - 0.5) * 5 }
      return {
        connectionName: `other-${index}`,
        traceThickness: 0.1,
        viaDiameter: 0.3,
        route: [
          { ...point, z: 0 },
          { ...point, z: 1 },
        ],
        vias: [point],
      }
    })
    const solver = new SingleSimplifiedPathSolver5({
      inputRoute: route,
      otherHdRoutes,
      obstacles,
      connMap: new ConnectivityMap({}),
      colorMap: {},
    })
    const progress = solver as unknown as ProgressWindow
    while (!solver.solved && !solver.failed) {
      solver.step()
      expect(progress.headDistanceAlongPath).toBeGreaterThanOrEqual(
        progress.tailDistanceAlongPath,
      )
    }
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    const output = solver.simplifiedRoute.route
    for (let index = 1; index < output.length; index++) {
      const previous = output[index - 1]!
      const point = output[index]!
      if (previous.z === point.z) continue
      expect(point.x).toBe(previous.x)
      expect(point.y).toBe(previous.y)
    }
  }
})
