import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../index"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

test("zero-distance events retain ordered vias, copper metadata and jumper anchors", (): void => {
  const routes: HighDensityRoute[] = [
    { connectionName: "constant-width", traceThickness: 0.1, viaDiameter: 0.3, route: Array.from({ length: 600 }, (_, index) => ({ x: index / 599, y: 0, z: 0, traceThickness: 0.1 })), vias: [] },
    { connectionName: "coincident-terminals", startPcbPortId: "start", endPcbPortId: "end", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], vias: [] },
    { connectionName: "initial-via", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 7 }, { x: 1, y: 0, z: 7 }], vias: [{ x: 0, y: 0 }] },
    { connectionName: "terminal-via", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 7 }], vias: [{ x: 1, y: 0 }] },
    { connectionName: "coincident-events", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, pcb_port_id: "terminal", traceThickness: 0.2 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 7 }], vias: [{ x: 0, y: 0 }] },
    { connectionName: "plated-copper", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0, toNextSegmentType: "through_obstacle", toNextSegmentCircuitJsonMetadata: { pcb_plated_hole_id: "owned-hole" } }, { x: 0, y: 0, z: 7 }], vias: [] },
    { connectionName: "slotted-copper", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0, toNextSegmentType: "through_obstacle", toNextSegmentCircuitJsonMetadata: { pcb_plated_hole_id: "owned-slot" } }, { x: 1, y: 1, z: 7 }, { x: 2, y: 1, z: 7 }], vias: [] },
    { connectionName: "jumper", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0, insideJumperPad: true }, { x: 1, y: 0, z: 0, insideJumperPad: true, pcb_port_id: "jumper-pad" }, { x: 2, y: 0, z: 0, insideJumperPad: true }, { x: 3, y: 0, z: 0 }], vias: [], jumpers: [{ route_type: "jumper", start: { x: 1, y: 0 }, end: { x: 2, y: 0 }, footprint: "0603" }] },
  ]
  for (const inputRoute of routes) {
    const original = structuredClone(inputRoute)
    const solver = new SingleSimplifiedPathSolver5({ inputRoute, otherHdRoutes: [], obstacles: [], connMap: new ConnectivityMap({}), colorMap: {} })
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(solver.iterations).toBeLessThan(1000)
    expect(inputRoute).toEqual(original)
    const output = solver.simplifiedRoute
    expect(output.route[0]).toEqual(inputRoute.route[0])
    expect(output.route.at(-1)).toEqual(inputRoute.route.at(-1))
    expect(output.route.length).toBeGreaterThanOrEqual(2)
    expect(output.vias).toEqual(inputRoute.vias)
    expect(output.jumpers).toEqual(inputRoute.jumpers)
    expect(output.route.every((point) => [point.x, point.y, point.z].every(Number.isFinite))).toBe(true)
    const transitions = (route: HighDensityRoute): HighDensityRoute["route"][] => route.route.slice(1).flatMap((point, index) => route.route[index]!.z !== point.z ? [[route.route[index]!, point]] : [])
    expect(transitions(output)).toEqual(transitions(inputRoute))
    let cursor = 0
    for (const point of inputRoute.route.filter((point) => Object.keys(point).some((key) => key !== "x" && key !== "y" && key !== "z" && key !== "traceThickness"))) {
      const index = output.route.findIndex((candidate, index) => index >= cursor && JSON.stringify(candidate) === JSON.stringify(point))
      expect(index).toBeGreaterThanOrEqual(cursor)
      cursor = index + 1
    }
  }
  const zero = new SingleSimplifiedPathSolver5({ inputRoute: routes[4]!, otherHdRoutes: [], obstacles: [], connMap: new ConnectivityMap({}), colorMap: {} })
  zero.solve()
  expect(zero.simplifiedRoute.route).toEqual([routes[4]!.route[0], routes[4]!.route[1], routes[4]!.route[2], routes[4]!.route[4]])
  for (const via of [{ x: 0, y: 0 }, { x: 1, y: 0 }]) {
    const solver = new SingleSimplifiedPathSolver5({ inputRoute: { connectionName: "offset-transition", traceThickness: 0.1, viaDiameter: 0.3, route: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 7 }], vias: [via] }, otherHdRoutes: [], obstacles: [], connMap: new ConnectivityMap({}), colorMap: {} })
    solver.solve()
    expect(solver.failed).toBe(false)
    expect(solver.simplifiedRoute.vias).toEqual([via])
    const transition = solver.simplifiedRoute.route.slice(1).findIndex((point, index) => point.z !== solver.simplifiedRoute.route[index]!.z)
    expect(solver.simplifiedRoute.route[transition]).toMatchObject(via)
    expect(solver.simplifiedRoute.route[transition + 1]).toMatchObject(via)
  }
})
