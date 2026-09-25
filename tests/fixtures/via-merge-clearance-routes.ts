import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { SameNetViaMergerSolverInput } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

export const createViaMergeClearanceRoutes = (): HighDensityRoute[] => [
  {
    connectionName: "left",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -2, y: 0, z: 0 },
      { x: -0.1, y: 0, z: 0 },
      { x: -0.1, y: 0, z: 1 },
      { x: -2, y: 0, z: 1 },
    ],
    vias: [{ x: -0.1, y: 0 }],
  },
  {
    connectionName: "diagonal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
    ],
    vias: [{ x: 0, y: 0 }],
  },
  {
    connectionName: "neighbor",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: 0.5, y: 0.788, z: 0 },
      { x: 0.6, y: 0.888, z: 0 },
    ],
    vias: [],
  },
]

export const createViaMergeClearanceInput =
  (): SameNetViaMergerSolverInput => ({
    inputHdRoutes: createViaMergeClearanceRoutes(),
    obstacles: [],
    colorMap: {},
    layerCount: 2,
    preserveRouteEndpoints: true,
    clearanceConstraints: { traceMargin: 0.1, obstacleMargin: 0.1 },
    connMap: new ConnectivityMap({
      power: ["left", "diagonal"],
      signal: ["neighbor"],
    }),
  })

export const createViaMergeBranchInput = (): SameNetViaMergerSolverInput => {
  const input = createViaMergeClearanceInput()
  const [anchor, moving, branch] = input.inputHdRoutes
  anchor!.route[1]!.x = anchor!.route[2]!.x = anchor!.vias[0]!.x = -0.3
  moving!.route[0]!.y = moving!.route[3]!.y = -1
  branch!.route = [
    { x: 0, y: 0.14, z: 0 },
    { x: 0, y: 1, z: 0 },
  ]
  input.inputHdRoutes = [moving!]
  input.otherHdRoutes = [anchor!, branch!]
  input.connMap = new ConnectivityMap({
    power: ["left", "diagonal", "neighbor"],
  })
  return input
}

export const createViaMergePadContactInput =
  (): SameNetViaMergerSolverInput => {
    const input = createViaMergeBranchInput()
    input.otherHdRoutes = [input.otherHdRoutes![0]!]
    input.layerCount = 4
    for (const route of [...input.inputHdRoutes, ...input.otherHdRoutes]) {
      for (const point of route.route) if (point.z === 1) point.z = 3
    }
    input.obstacles = [
      {
        type: "rect",
        shape: "circle",
        center: { x: 0, y: 0.14 },
        width: 0.1,
        height: 0.1,
        layers: ["inner1"],
        connectedTo: ["power"],
      },
    ]
    return input
  }
