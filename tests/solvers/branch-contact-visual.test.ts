import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { SingleSimplifiedPathSolver5 } from "lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("path cleanup keeps a same-net branch connected", (): void => {
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
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute: trunk,
    otherHdRoutes: [branch],
    obstacles: [],
    colorMap: { power_trunk: "#16a34a", power_branch: "#2563eb" },
    connMap: new ConnectivityMap({ power: ["power_trunk", "power_branch"] }),
  })
  solver.solve()
  const graphics = solver.visualize()
  graphics.texts = [
    {
      x: -0.5,
      y: 2.7,
      text: "Power branch must remain connected during path cleanup",
      fontSize: 0.12,
      color: "#334155",
    },
  ]
  expect(
    getSvgFromGraphicsObject(graphics, {
      backgroundColor: "white",
      svgWidth: 900,
      svgHeight: 600,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
