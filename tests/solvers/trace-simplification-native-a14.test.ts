import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import { TraceSimplificationSolver, type HighDensityRoute } from "../../index"

// Native ButterStick DDR crop: A14 beside the A6 and RST full-stack vias.
const inputHdRoutes: HighDensityRoute[] = [
  {
    connectionName: "source_net_6_mst1",
    rootConnectionName: "source_net_6",
    traceThickness: 0.089,
    viaDiameter: 0.4,
    route: [
      { x: 10.695, y: 7.204, z: 6 },
      { x: 10.816, y: 7.198, z: 6 },
      { x: 10.816, y: 7.198, z: 0 },
      { x: 10.695, y: 7.204, z: 0 },
    ],
    vias: [{ x: 10.816, y: 7.198 }],
  },
  {
    connectionName: "source_net_6_mst0",
    rootConnectionName: "source_net_6",
    traceThickness: 0.089,
    viaDiameter: 0.4,
    route: [
      { x: 11.731, y: 3.186, z: 3 },
      { x: 11.625, y: 6.622, z: 3 },
      { x: 11.625, y: 6.622, z: 0 },
      { x: 10.793, y: 6.78, z: 0 },
    ],
    vias: [{ x: 11.625, y: 6.622 }],
  },
]
const otherHdRoutes: HighDensityRoute[] = [
  {
    connectionName: "source_net_12_mst0",
    rootConnectionName: "source_net_12",
    traceThickness: 0.089,
    viaDiameter: 0.4,
    route: [
      { x: 11.036, y: 5.531, z: 1 },
      { x: 10.982767382384994, y: 5.72506814972387, z: 1 },
      { x: 10.982767382384994, y: 5.72506814972387, z: 0 },
      { x: 10.735, y: 5.598, z: 0 },
    ],
    vias: [{ x: 10.982767382384994, y: 5.72506814972387 }],
  },
  {
    connectionName: "source_net_50_mst1",
    rootConnectionName: "source_net_50",
    traceThickness: 0.089,
    viaDiameter: 0.4,
    route: [
      { x: 10.831, y: 6.325, z: 7 },
      { x: 10.94, y: 6.238, z: 7 },
      { x: 10.94, y: 6.238, z: 0 },
      { x: 11.019, y: 6.164, z: 0 },
    ],
    vias: [{ x: 10.94, y: 6.238 }],
  },
]

test("ButterStick A14 simplification beside A6 and RST", async (): Promise<void> => {
  const solver = new TraceSimplificationSolver({
    hdRoutes: inputHdRoutes,
    otherHdRoutes,
    obstacles: [],
    colorMap: {},
    layerCount: 8,
    defaultViaDiameter: 0.4,
    minTraceToPadEdgeClearance: 0.0889,
    connMap: new ConnectivityMap({
      source_net_6: ["source_net_6_mst1", "source_net_6_mst0"],
      source_net_12: ["source_net_12_mst0"],
      source_net_50: ["source_net_50_mst1"],
    }),
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const simplifiedRoutes = solver.simplifiedHdRoutes
  expect(simplifiedRoutes).toHaveLength(inputHdRoutes.length)
  const sharedViaSites = new Set(
    simplifiedRoutes.flatMap((route) =>
      route.vias.map((via) => `${via.x},${via.y}`),
    ),
  )
  expect(sharedViaSites.size).toBe(1)

  const styles: Record<string, { label: string; color: string; fill: string }> =
    {
      source_net_6: {
        label: "A14",
        color: "#2563eb",
        fill: "rgba(37,99,235,0.25)",
      },
      source_net_12: {
        label: "A6",
        color: "#d97706",
        fill: "rgba(217,119,6,0.35)",
      },
      source_net_50: {
        label: "RST",
        color: "#9333ea",
        fill: "rgba(147,51,234,0.35)",
      },
    }
  const graphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    title: "ButterStick A14 via merge",
    lines: [],
    circles: [],
    texts: [
      {
        x: 11,
        y: 7.8,
        text: "Layer 3; vias drill 0–7",
        fontSize: 0.14,
      },
      {
        x: 11,
        y: 7.58,
        text: "0.089 mm wires / 0.4 mm vias",
        fontSize: 0.1,
      },
      {
        x: 10.25,
        y: 5.725,
        text: "A6",
        color: styles.source_net_12.color,
        fontSize: 0.14,
      },
      {
        x: 10.25,
        y: 6.238,
        text: "RST",
        color: styles.source_net_50.color,
        fontSize: 0.14,
      },
      {
        x: 11.9,
        y: 4.6,
        text: "A14",
        color: styles.source_net_6.color,
        fontSize: 0.11,
        rotation: 90,
      },
    ],
  }
  const drawnViaSites = new Set<string>()
  // Draw unchanged foreign full-stack vias alongside the public result.
  for (const route of [...simplifiedRoutes, ...otherHdRoutes]) {
    const net = route.rootConnectionName ?? route.connectionName
    const style = styles[net]
    for (let i = 1; i < route.route.length; i++) {
      const start = route.route[i - 1]!
      const end = route.route[i]!
      if (start.z !== 3 || end.z !== 3) continue
      graphics.lines!.push({
        points: [start, end],
        strokeWidth: start.traceThickness ?? route.traceThickness,
        strokeColor: style.color,
        layer: "z3",
        label: style.label,
      })
    }
    for (const via of route.vias) {
      const key = `${net}:${via.x},${via.y}`
      if (drawnViaSites.has(key)) continue
      drawnViaSites.add(key)
      graphics.circles!.push({
        center: via,
        radius: route.viaDiameter / 2,
        stroke: style.color,
        fill: style.fill,
        layer: "z0,1,2,3,4,5,6,7",
        label: `${style.label} via`,
      })
    }
  }
  await expect(
    getSvgFromGraphicsObject(graphics, {
      backgroundColor: "white",
      svgWidth: 800,
      svgHeight: 1000,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
