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
