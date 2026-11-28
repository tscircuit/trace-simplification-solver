import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"

test("diagonal shortcuts measure clearance to a hole's circular edge", () => {
  const start = { x: -1, y: 2.8, z: 0 }
  const end = { x: 2.8, y: -1, z: 0 }

  for (const shape of ["circle", undefined] as const) {
    const solver = new SingleSimplifiedPathSolver5({
      obstacles: [
        {
          type: "rect",
          shape,
          isNonPlatedHole: true,
          center: { x: 0, y: 0 },
          width: 2,
          height: 2,
          layers: ["top"],
          __zLayers: [0],
          connectedTo: [],
        },
      ],
      inputRoute: {
        connectionName: "signal",
        traceThickness: 0.15,
        viaDiameter: 0.4,
        vias: [],
        route: [start, { x: 2.8, y: 2.8, z: 0 }, end],
      },
      otherHdRoutes: [],
      connMap: new ConnectivityMap({}),
      colorMap: {},
    })
    // The diagonal clears the physical circle but clips the square corner.
    expect(solver.isValidPathSegment(start, end)).toBe(shape === "circle")
    // At y=1.15 the copper-edge gap is only 0.075 mm for either shape.
    expect(
      solver.isValidPathSegment(
        { x: -2, y: 1.15, z: 0 },
        { x: 2, y: 1.15, z: 0 },
      ),
    ).toBe(false)
  }
})
