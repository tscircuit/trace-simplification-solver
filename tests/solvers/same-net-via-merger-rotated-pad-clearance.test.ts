import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

test("checks rotated pads against the attached wire after an overlapping via merge", (): void => {
  const [anchor, diagonal] = createViaMergeClearanceRoutes()
  const solver = new SameNetViaMergerSolver({
    inputHdRoutes: [diagonal!],
    otherHdRoutes: [anchor!],
    obstacles: [
      {
        type: "rect",
        center: { x: 0.55, y: 0.838 },
        width: Math.SQRT2 * 0.1,
        height: 0.1,
        ccwRotationDegrees: 45,
        layers: ["top"],
        connectedTo: ["signal"],
      },
    ],
    colorMap: {},
    layerCount: 2,
    preserveRouteEndpoints: true,
    clearanceConstraints: { traceMargin: 0.1, obstacleMargin: 0.1 },
    connMap: new ConnectivityMap({ power: ["left", "diagonal"] }),
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.getMergedViaHdRoutes()).toEqual([diagonal!])
})
