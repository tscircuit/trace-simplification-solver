import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { Obstacle } from "lib/types"
import type { HighDensityRoute } from "lib/types/high-density-types"

const route: HighDensityRoute = {
  connectionName: "source_net_altium_pcb_379",
  rootConnectionName: "source_net_altium_pcb_379",
  startPcbPortId: "pcb_port_altium_6139",
  endPcbPortId: "pcb_port_altium_7665",
  traceThickness: 0.1524,
  viaDiameter: 0.2032,
  route: [
    {
      x: 173.51325978,
      y: 113.7919111,
      z: 0,
      toNextSegmentType: "through_obstacle",
    },
    { x: 173.344, y: 114.467, z: 7 },
    { x: 173.142, y: 114.492, z: 7 },
    { x: 173.302, y: 114.555, z: 7 },
    { x: 173.892, y: 115.27, z: 7 },
    { x: 173.344, y: 115.295, z: 7 },
    { x: 173.517, y: 115.595, z: 7 },
  ],
  vias: [],
}

const platedHoleObstacle: Obstacle = {
  circuitJsonMetadata: {
    pcb_plated_hole_id: "pcb_plated_hole_altium_6139",
    pcb_port_id: "pcb_port_altium_6139",
    source_component_name: "J1",
    source_port_name: "1",
  },
  componentId: "pcb_component_altium_27",
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
  center: { x: 173.51325978, y: 113.7919111 },
  width: 1.34999984,
  height: 1.34999984,
  connectedTo: [
    "pcb_plated_hole_altium_6139",
    "source_net_altium_pcb_379",
    "source_trace_altium_pcb_379",
  ],
}

test("reproduces the dropped PMP22650 plated-hole transition", () => {
  const solver = new TraceSimplificationSolver({
    hdRoutes: [route],
    obstacles: [platedHoleObstacle],
    connMap: new ConnectivityMap({}),
    colorMap: {},
    defaultViaDiameter: route.viaDiameter,
    layerCount: 8,
  })
  const transition = solver.hdRoutes[0].route[0]

  expect(transition.toNextSegmentType).toBeUndefined()

  expect(
    getSvgFromGraphicsObject(
      {
        coordinateSystem: "cartesian",
        title: "PMP22650 plated-hole layer transition",
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
