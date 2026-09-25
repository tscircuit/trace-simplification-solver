import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

const makeViaRoute = ({
  connectionName,
  rootConnectionName,
  x,
}: {
  connectionName: string
  rootConnectionName: string
  x: number
}): HighDensityRoute => ({
  connectionName,
  rootConnectionName,
  traceThickness: 0.1,
  viaDiameter: 0.3,
  route: [
    { x: x - 0.5, y: 0, z: 0 },
    { x, y: 0, z: 0 },
    { x, y: 0, z: 1 },
    { x: x + 0.5, y: 0, z: 1 },
  ],
  vias: [{ x, y: 0 }],
})

test("same-net via merging reuses an immutable via without mutating it", () => {
  const editableRoute = makeViaRoute({
    connectionName: "editable",
    rootConnectionName: "net0",
    x: 0.02,
  })
  const immutableRoute = makeViaRoute({
    connectionName: "preloaded_fixed_0",
    rootConnectionName: "net0",
    x: 0,
  })
  const immutableSnapshot = structuredClone(immutableRoute)
  const solverInput = {
    inputHdRoutes: [editableRoute],
    otherHdRoutes: [immutableRoute],
    netByConnectionName: new Map([["preloaded_fixed_0", "net0"]]),
    obstacles: [],
    colorMap: { editable: "purple" },
    layerCount: 2,
    connMap: new ConnectivityMap({
      net0: ["editable"],
    }),
  }
  const solver = new SameNetViaMergerSolver(solverInput)

  solver.solve()

  expect(solver.failed).toBeFalse()
  const [mergedRoute] = solver.getMergedViaHdRoutes()!
  expect(mergedRoute!.vias).toEqual([{ x: 0, y: 0 }])
  expect(
    mergedRoute!.route.filter(
      (point, pointIndex) =>
        pointIndex > 0 && point.z !== mergedRoute!.route[pointIndex - 1]!.z,
    ),
  ).toEqual([{ x: 0, y: 0, z: 1 }])
  expect(immutableRoute).toEqual(immutableSnapshot)
  expect(solver.solved).toBeTrue()

  const replay = new SameNetViaMergerSolver({
    ...solverInput,
    inputHdRoutes: [mergedRoute!],
  })
  replay.solve()
  expect(replay.solved).toBeTrue()
  expect(replay.getMergedViaHdRoutes()).toEqual([mergedRoute!])

  const nearbyRoute = makeViaRoute({
    connectionName: "nearby",
    rootConnectionName: "net0",
    x: 0.25,
  })
  const sharedAnchorSolver = new SameNetViaMergerSolver({
    ...solverInput,
    inputHdRoutes: [nearbyRoute, mergedRoute!],
    netByConnectionName: new Map([
      ["preloaded_fixed_0", "net0"],
      ["nearby", "net0"],
    ]),
  })
  sharedAnchorSolver.solve()
  expect(sharedAnchorSolver.solved).toBeTrue()
  expect(
    sharedAnchorSolver.getMergedViaHdRoutes()!.map((route) => route.vias),
  ).toEqual([[{ x: 0, y: 0 }], [{ x: 0, y: 0 }]])
  expect(immutableRoute).toEqual(immutableSnapshot)

  const graphics = solver.visualize()
  graphics.texts = [
    { x: 0, y: 0.55, text: "FIXED ANCHOR: ONE PHYSICAL VIA", fontSize: 0.065 },
    {
      x: 0,
      y: 0.4,
      text: "Editable route keeps its layer-transition via",
      fontSize: 0.05,
    },
    {
      x: 0,
      y: -0.4,
      text: "Top (red) -> shared via -> bottom (blue)",
      fontSize: 0.05,
    },
  ]
  expect(
    getSvgFromGraphicsObject(graphics, {
      backgroundColor: "white",
      svgWidth: 800,
      svgHeight: 600,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
