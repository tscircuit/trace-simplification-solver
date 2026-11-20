import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { VertexShortcutPathSolver } from "lib/solvers/SimplifiedPathSolver/VertexShortcutPathSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("detour tightening preserves anchored corners and non-wire sections", (): void => {
  for (const anchor of [
    "terminal",
    "via",
    "width",
    "through_obstacle",
    "inside_jumper_pad",
    "jumper",
  ]) {
    const inputRoute: HighDensityRoute = {
      connectionName: "signal",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -7, y: 0, z: 0 },
        { x: -7, y: 0.3, z: 0 },
        { x: -1.05, y: 6.25, z: 0 },
        { x: 1.05, y: 6.25, z: 0 },
        { x: 7, y: 0.3, z: 0 },
        { x: 7, y: 0, z: 0 },
      ],
    }
    if (anchor === "terminal") {
      inputRoute.route[2].pcb_port_id = "tap-left"
      inputRoute.route[3].pcb_port_id = "tap-right"
    } else if (anchor === "width") {
      inputRoute.route[2].traceThickness = 0.3
      inputRoute.route[3].traceThickness = 0.3
    } else if (anchor === "through_obstacle") {
      inputRoute.route[2].toNextSegmentType = "through_obstacle"
    } else if (anchor === "inside_jumper_pad") {
      inputRoute.route[2].insideJumperPad = true
      inputRoute.route[3].insideJumperPad = true
    } else if (anchor === "jumper") {
      inputRoute.jumpers = [
        {
          route_type: "jumper",
          start: { x: -1.05, y: 6.25 },
          end: { x: 1.05, y: 6.25 },
          footprint: "1206",
        },
      ]
    } else {
      inputRoute.vias = [
        { x: -1.05, y: 6.25 },
        { x: 1.05, y: 6.25 },
      ]
      inputRoute.route.splice(3, 0, { ...inputRoute.route[2], z: 1 })
      inputRoute.route.splice(4, 0, { ...inputRoute.route[4], z: 1 })
    }
    const original = structuredClone(inputRoute)
    const solver = new VertexShortcutPathSolver({
      inputRoute,
      otherHdRoutes: [],
      obstacles: [
        {
          type: "rect",
          layers: ["top", "bottom"],
          __zLayers: [0, 1],
          center: { x: 0, y: 0 },
          width: 5,
          height: 9,
          connectedTo: [],
        },
      ],
      connMap: new ConnectivityMap({}),
      colorMap: {},
      useTraceWidthAwareClearance: true,
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    const output = solver.simplifiedRoute
    for (const point of inputRoute.route.filter((point) => point.y === 6.25)) {
      expect(output.route).toContainEqual(expect.objectContaining(point))
    }
    expect(output.vias).toEqual(inputRoute.vias)
    expect(output.jumpers).toEqual(inputRoute.jumpers)
    expect(inputRoute).toEqual(original)
  }
  const longRoute: HighDensityRoute = {
    connectionName: "tapped-signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    vias: [],
    route: Array.from({ length: 600 }, (_, x) => ({
      x,
      y: 0,
      z: 0,
      pcb_port_id: `tap${x}`,
    })),
  }
  const longSolver = new VertexShortcutPathSolver({
    inputRoute: longRoute,
    otherHdRoutes: [],
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
  })
  longSolver.solve()
  expect(longSolver.solved).toBe(true)
  expect(longSolver.simplifiedRoute.route).toEqual(longRoute.route)
})
