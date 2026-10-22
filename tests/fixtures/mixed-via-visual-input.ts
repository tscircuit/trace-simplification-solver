import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

export const createMixedViaVisualInput = (): ConstructorParameters<
  typeof TraceSimplificationSolver
>[0] => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.2,
    viaDiameter: 0.6,
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0.5, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 0, z: 1 },
      { x: 4, y: 0, z: 1 },
      { x: 4, y: 0, z: 0 },
      { x: 6, y: 0, z: 0 },
    ],
    vias: [
      { x: 2, y: 0, diameter: 0.6, holeDiameter: 0.3 },
      { x: 4, y: 0, diameter: 1, holeDiameter: 0.5 },
    ],
  }
  return {
    hdRoutes: [route],
    obstacles: [
      {
        type: "rect" as const,
        layers: ["top"],
        center: { x: 3, y: 0 },
        width: 0.5,
        height: 4,
        connectedTo: [],
      },
    ],
    connMap: new ConnectivityMap({ signal: ["signal"] }),
    colorMap: {},
    defaultViaDiameter: 0.6,
    layerCount: 2,
    preserveRouteEndpoints: true,
    enableVertexShortcuts: true,
  }
}
