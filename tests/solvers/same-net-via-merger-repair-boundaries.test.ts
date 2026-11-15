import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import {
  SameNetViaMergerSolver,
  type SameNetViaMergerSolverInput,
} from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import { createViaMergeClearanceRoutes } from "tests/fixtures/via-merge-clearance-routes"

const createInput = (): SameNetViaMergerSolverInput => {
  const [anchor, moving] = createViaMergeClearanceRoutes()
  return {
    inputHdRoutes: [moving!],
    otherHdRoutes: [anchor!],
    obstacles: [],
    colorMap: {},
    layerCount: 2,
    preserveRouteEndpoints: true,
    clearanceConstraints: { traceMargin: 0.1, obstacleMargin: 0.1 },
    connMap: new ConnectivityMap({ power: ["left", "diagonal"] }),
  }
}

const solve = (input: SameNetViaMergerSolverInput) => {
  const before = structuredClone(input.inputHdRoutes)
  const peers = structuredClone(input.otherHdRoutes)
  const solver = new SameNetViaMergerSolver(input)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(input.inputHdRoutes).toEqual(before)
  expect(input.otherHdRoutes).toEqual(peers)
  return solver.getMergedViaHdRoutes()!
}

test("clear wires merge into a fixed anchor and retain transition metadata", () => {
  const input = createInput()
  const output = solve(input)
  expect(output[0]!.vias).toEqual([{ x: -0.1, y: 0 }])
  expect(output[0]!.route.map((p) => p.z)).toEqual([0, 0, 1, 1])
  expect(output[0]!.route[0]).toEqual(input.inputHdRoutes[0]!.route[0])
  expect(output[0]!.route.at(-1)).toEqual(input.inputHdRoutes[0]!.route.at(-1))
})

test("does not enlarge copper at an occupied site with a different diameter", () => {
  const input = createInput()
  input.inputHdRoutes[0]!.viaDiameter = 0.4
  expect(solve(input)).toEqual(input.inputHdRoutes)
})

test("keeps a transition cluster containing a PCB terminal fixed", () => {
  const input = createInput()
  input.inputHdRoutes[0]!.route[1]!.pcb_port_id = "terminal"
  expect(solve(input)).toEqual(input.inputHdRoutes)
})

test("ordinary endpoint terminal metadata does not prevent a safe internal merge", () => {
  const input = createInput()
  input.inputHdRoutes[0]!.route[0]!.pcb_port_id = "start"
  input.inputHdRoutes[0]!.route[3]!.pcb_port_id = "end"
  expect(solve(input)[0]!.vias).toEqual([{ x: -0.1, y: 0 }])
})

test("commits one group per step and indexes its moved copper before the next group", () => {
  const input = createInput()
  const second = createInput()
  for (const route of [...second.inputHdRoutes, ...second.otherHdRoutes!]) {
    route.connectionName += "-second"
    for (const point of route.route) point.y += 5
    for (const via of route.vias) via.y += 5
  }
  input.inputHdRoutes.push(...second.inputHdRoutes)
  input.otherHdRoutes = [...input.otherHdRoutes!, ...second.otherHdRoutes!]
  input.connMap = new ConnectivityMap({
    power: ["left", "diagonal"],
    second: ["left-second", "diagonal-second"],
  })
  const solver = new SameNetViaMergerSolver(input)
  const oldIndex = solver.hdRouteSHI
  solver.step()
  expect(solver.stats.mergedViaGroups).toBe(1)
  expect(solver.hdRouteSHI).not.toBe(oldIndex)
  const indexed = solver.hdRouteSHI
    .getConflictingRoutesNearPoint({ x: -0.1, y: 0, z: 0 }, 0.01)
    .find(
      ({ conflictingRoute }) => conflictingRoute.connectionName === "diagonal",
    )
  expect(indexed!.conflictingRoute.vias).toEqual([{ x: -0.1, y: 0 }])
  expect(solver.getMergedViaHdRoutes()![1]!.vias).toEqual([{ x: 0, y: 5 }])
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.stats.mergedViaGroups).toBe(2)
  expect(solver.getMergedViaHdRoutes()![1]!.vias).toEqual([{ x: -0.1, y: 5 }])
})

test("keeps a transition at a splice endpoint fixed", () => {
  const input = createInput()
  input.inputHdRoutes[0]!.route.shift()
  expect(solve(input)).toEqual(input.inputHdRoutes)
})

test("rejects a circular foreign pad intersecting the reshaped wire", () => {
  const input = createInput()
  input.obstacles = [
    {
      type: "rect",
      shape: "circle",
      center: { x: 0.5, y: 0.82 },
      width: 0.15,
      height: 0.15,
      layers: ["top"],
      connectedTo: ["foreign"],
    },
  ]
  expect(solve(input)).toEqual(input.inputHdRoutes)
})

test("preserves a same-net pad contact at the removed via", () => {
  const input = createInput()
  const anchor = input.otherHdRoutes![0]!
  anchor.route[1]!.x = anchor.route[2]!.x = anchor.vias[0]!.x = -0.3
  input.inputHdRoutes[0]!.route[0]!.y = -1
  input.inputHdRoutes[0]!.route[3]!.y = -1
  input.obstacles = [
    {
      type: "rect",
      center: { x: 0, y: 0.17 },
      width: 0.08,
      height: 0.08,
      layers: ["top"],
      connectedTo: ["power"],
    },
  ]
  expect(solve(input)).toEqual(input.inputHdRoutes)
})

test("rejects a target outside the board outline", () => {
  const input = createInput()
  input.outline = [
    { x: -0.06, y: -2 },
    { x: 2, y: -2 },
    { x: 2, y: 2 },
    { x: -0.06, y: 2 },
  ]
  expect(solve(input)).toEqual(input.inputHdRoutes)
})

test("enforces the copper radius plus board-edge margin", () => {
  const input = createInput()
  input.outline = [
    { x: -0.3, y: -2 },
    { x: 2, y: -2 },
    { x: 2, y: 2 },
    { x: -0.3, y: 2 },
  ]
  input.clearanceConstraints!.boardEdgeMargin = 0.1
  expect(solve(input)).toEqual(input.inputHdRoutes)
  input.clearanceConstraints!.boardEdgeMargin = 0
  expect(solve(input)[0]!.vias).toEqual([{ x: -0.1, y: 0 }])
})

test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid clearance %s",
  (margin) => {
    const input = createInput()
    input.clearanceConstraints!.traceMargin = margin
    expect(() => new SameNetViaMergerSolver(input)).toThrow(
      "finite nonnegative",
    )
  },
)
