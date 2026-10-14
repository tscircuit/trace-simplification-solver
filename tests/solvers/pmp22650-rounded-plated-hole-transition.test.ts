import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

const route: HighDensityRoute = {
  connectionName: "source_net_altium_pcb_385_mst316",
  rootConnectionName: "source_net_altium_pcb_385",
  startPcbPortId: "pcb_port_altium_6654",
  endPcbPortId: "pcb_port_altium_6857",
  traceThickness: 0.1,
  viaDiameter: 0.3,
  route: [
    { x: 140.823, y: 135.084, z: 0 },
    { x: 143.873, y: 135.084, z: 1 },
  ],
  vias: [{ x: 140.823, y: 135.084 }],
}

const platedHoleObstacle: Obstacle = {
  circuitJsonMetadata: {
    pcb_plated_hole_id: "pcb_plated_hole_altium_6226",
    pcb_port_id: "pcb_port_altium_6226",
    source_component_name: "C223",
    source_port_name: "1",
  },
  componentId: "pcb_component_altium_12",
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
  center: { x: 142.34839958, y: 133.74619936 },
  width: 3.04999898,
  height: 3.04999898,
  connectedTo: [
    "pcb_plated_hole_altium_6226",
    "source_net_altium_pcb_385",
    "pcb_port_altium_6226",
  ],
}

test("reproduces the rounded PMP22650 plated-hole transition", () => {
  const solver = new TraceSimplificationSolver({
    hdRoutes: [route],
    obstacles: [platedHoleObstacle],
    connMap: new ConnectivityMap({}),
    colorMap: {},
    defaultViaDiameter: route.viaDiameter,
    layerCount: 8,
  })
  const transition = solver.hdRoutes[0].route[0]

  expect(transition.toNextSegmentType).toBe("through_obstacle")

  expect(
    getSvgFromGraphicsObject(
      {
        coordinateSystem: "cartesian",
        title: "PMP22650 C223 rounded plated-hole transition",
        rects: [
          {
            center: platedHoleObstacle.center,
            width: platedHoleObstacle.width,
            height: platedHoleObstacle.height,
            fill: "rgba(168, 85, 247, 0.28)",
            stroke: "#a855f7",
          },
        ],
        lines: [
          {
            points: [route.route[0], route.route[1]],
            strokeColor:
              transition.toNextSegmentType === "through_obstacle"
                ? "#22c55e"
                : "#f59e0b",
            strokeWidth: route.traceThickness,
          },
        ],
        points: [
          { ...route.route[0], color: "#ef4444" },
          { ...route.route[1], color: "#3b82f6" },
        ],
        circles: [],
      },
      {
        backgroundColor: "#0d1b2a",
        svgWidth: 900,
        svgHeight: 700,
        hideInlineLabels: true,
      },
    ),
  ).toMatchSvgSnapshot(import.meta.path)
})
