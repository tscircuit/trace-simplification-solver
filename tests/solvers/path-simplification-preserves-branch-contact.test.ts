import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { MultiSimplifiedPathSolver } from "lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"
import { minimumDistanceBetweenSegments } from "lib/utils/minimumDistanceBetweenSegments"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("shortens a loop while retaining its same-net branch contact", (): void => {
  const trunk: HighDensityRoute = {
    connectionName: "power_trunk",
    rootConnectionName: "power",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 2, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
    ],
    vias: [],
  }
  const branch: HighDensityRoute = {
    ...trunk,
    connectionName: "power_branch",
    route: [
      { x: 2, y: 1, z: 0 },
      { x: 3, y: 1, z: 0 },
    ],
  }
  for (const otherHdRoutes of [[], [branch]]) {
    const solver = new MultiSimplifiedPathSolver({
      unsimplifiedHdRoutes: [trunk],
      otherHdRoutes,
      obstacles: [],
      connMap: new ConnectivityMap({ power: ["power_trunk", "power_branch"] }),
    })
    solver.solve()
    expect(solver.failed).toBe(false)
    expect(solver.solved).toBe(true)
    const route = solver.simplifiedHdRoutes[0]!
    const distanceToBranch = Math.min(
      ...route.route
        .slice(1)
        .map((point, index) =>
          minimumDistanceBetweenSegments(
            route.route[index]!,
            point,
            branch.route[0]!,
            branch.route[1]!,
          ),
        ),
    )
    expect(
      distanceToBranch < (route.traceThickness + branch.traceThickness) / 2,
    ).toBe(otherHdRoutes.length > 0)
    const length = route.route
      .slice(1)
      .reduce(
        (sum, point, index) =>
          sum +
          Math.hypot(
            point.x - route.route[index]!.x,
            point.y - route.route[index]!.y,
          ),
        0,
      )
    expect(length).toBeLessThan(9)
    expect(route.route[0]).toMatchObject(trunk.route[0]!)
    expect(route.route.at(-1)).toMatchObject(trunk.route.at(-1)!)
  }
})
