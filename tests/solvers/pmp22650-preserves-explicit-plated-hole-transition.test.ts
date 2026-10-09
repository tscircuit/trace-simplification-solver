import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

test("preserves the explicit PMP22650 C18 plated-hole transition", () => {
  const route: HighDensityRoute = {
    connectionName: "source_net_altium_pcb_374_mst49",
    rootConnectionName: "source_net_altium_pcb_374",
    traceThickness: 0.2,
    viaDiameter: 0.5,
    route: [
      {
        x: 265.402,
        y: 56.047,
        z: 0,
        toNextSegmentType: "through_obstacle",
        toNextSegmentCircuitJsonMetadata: {
          pcb_plated_hole_id: "pcb_plated_hole_altium_6223",
          pcb_port_id: "pcb_port_altium_6223",
          source_component_name: "C18",
          source_port_name: "2",
        },
      },
      {
        x: 265.912,
        y: 52.997,
        z: 7,
      },
    ],
    vias: [],
  }
  const obstacle: Obstacle = {
    circuitJsonMetadata: {
      pcb_plated_hole_id: "pcb_plated_hole_altium_6223",
      pcb_port_id: "pcb_port_altium_6223",
      source_component_name: "C18",
      source_port_name: "2",
    },
    componentId: "pcb_component_altium_20",
    type: "rect",
    layers: [
      "top",
      "inner1",
      "inner2",
      "inner3",
      "inner4",
      "inner5",
      "inner6",
      "bottom",
    ],
    center: { x: 266.70023113999997, y: 54.52203471999999 },
    width: 3.04999898,
    height: 3.04999898,
    connectedTo: [
      "pcb_plated_hole_altium_6223",
      "source_net_altium_pcb_374",
      "source_trace_altium_pcb_374",
    ],
  }

  const solver = new TraceSimplificationSolver({
    hdRoutes: [route],
    obstacles: [obstacle],
    connMap: new ConnectivityMap({}),
    colorMap: {},
    defaultViaDiameter: 0.5,
    layerCount: 8,
  })

  expect(solver.hdRoutes[0]!.route[0]!.toNextSegmentType).toBe(
    "through_obstacle",
  )
  expect(
    solver.hdRoutes[0]!.route[0]!.toNextSegmentCircuitJsonMetadata,
  ).toEqual(obstacle.circuitJsonMetadata)
})
