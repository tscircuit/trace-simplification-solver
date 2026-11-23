import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import { minimumDistanceBetweenSegments } from "../../lib/utils/minimumDistanceBetweenSegments"
import { MultiSimplifiedPathSolver } from "../../lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

const signal: HighDensityRoute = {
  connectionName: "signal",
  traceThickness: 0.16,
  viaDiameter: 0.6,
  vias: [],
  route: [
    { x: -3, y: 0, z: 0 },
    { x: -2, y: -1, z: 0 },
    { x: 2, y: -1, z: 0 },
    { x: 3, y: 0, z: 0 },
  ],
}

test("simplifying a legal detour preserves copper-to-copper clearance", () => {
  const other: HighDensityRoute = {
    ...signal,
    connectionName: "other",
    route: [
      { x: -0.5, y: 0.28, z: 0 },
      { x: 0.5, y: 0.28, z: 0 },
    ],
  }
  const solver = new MultiSimplifiedPathSolver({
    unsimplifiedHdRoutes: [signal],
    otherHdRoutes: [other],
    obstacles: [],
    minTraceToPadEdgeClearance: 0.14,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  const points = solver.simplifiedHdRoutes[0]!.route
  const gap =
    Math.min(
      ...points
        .slice(1)
        .map((p, i) =>
          minimumDistanceBetweenSegments(
            points[i]!,
            p,
            other.route[0]!,
            other.route[1]!,
          ),
        ),
    ) -
    (signal.traceThickness + other.traceThickness) / 2
  expect(gap).toBeGreaterThanOrEqual(0.14)
})

test("shortcut lookup includes traces within the board clearance across grid cells", () => {
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute: signal,
    otherHdRoutes: [
      {
        ...signal,
        connectionName: "other",
        route: [
          { x: -1, y: 1, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
      },
    ],
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
    minTraceToPadEdgeClearance: 0.9,
  })
  expect(solver.isValidPathSegment(signal.route[0]!, signal.route[3]!)).toBe(
    false,
  )
})

test("a thin trace can straighten past a pad when its copper clears the declared gap", () => {
  // The near edge of the pad is 0.26 mm above the shortcut. The legal
  // copper gap is 0.21 mm with a 0.10 mm trace, and 0.18 mm with 0.16 mm.
  for (const traceThickness of [0.1, 0.16]) {
    const solver = new MultiSimplifiedPathSolver({
      unsimplifiedHdRoutes: [{ ...signal, traceThickness }],
      obstacles: [
        {
          type: "rect",
          center: { x: 0, y: 0.76 },
          width: 1,
          height: 1,
          layers: ["top"],
          connectedTo: [],
        },
      ],
      minTraceToPadEdgeClearance: 0.2,
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    const points = solver.simplifiedHdRoutes[0]!.route
    expect(points.every((p) => Math.abs(p.y) < 1e-9)).toBe(
      traceThickness === 0.1,
    )
  }
})

test("restating an already satisfied board gap preserves normal shortcut spacing", () => {
  const route = { ...signal, traceThickness: 0.1 }
  const params = {
    inputRoute: route,
    otherHdRoutes: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
    obstacles: [
      {
        type: "rect" as const,
        center: { x: 0, y: 0.66 },
        width: 1,
        height: 1,
        __zLayers: [0],
        layers: ["top"],
        connectedTo: [],
      },
    ],
  }
  const acceptsShortcut = (options: {
    minTraceToPadEdgeClearance?: number
    useTraceWidthAwareClearance?: boolean
  }) =>
    new SingleSimplifiedPathSolver5({
      ...params,
      ...options,
    }).isValidPathSegment(route.route[0]!, route.route[3]!)
  expect(acceptsShortcut({})).toBe(false)
  expect(acceptsShortcut({ minTraceToPadEdgeClearance: 0.1 })).toBe(false)
  expect(
    acceptsShortcut({
      minTraceToPadEdgeClearance: 0.1,
      useTraceWidthAwareClearance: true,
    }),
  ).toBe(true)
})
