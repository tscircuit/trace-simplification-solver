import {
  getSvgFromGraphicsObject,
  getBounds,
  computeTransformFromViewbox,
  type GraphicsObject,
} from "graphics-debug"
import type { HighDensityRoute } from "lib/types/high-density-types"
import type { Obstacle } from "lib/types"

export type ViaMergePanel = {
  title: string
  details: [string, string, string]
  routes: HighDensityRoute[]
}

/** Shared by snapshot tests and the video so every diagram uses tested output. */
export const getViaMergeComparisonSvg = ({
  panels,
  fixedRoutes = [],
  obstacles = [],
  layer = 0,
  focus,
  detailCenter,
}: {
  panels: ViaMergePanel[]
  fixedRoutes?: ReadonlyArray<HighDensityRoute>
  obstacles?: Obstacle[]
  layer?: number
  detailCenter: { x: number; y: number }
  focus?: number
}): string => {
  const allPoints = [
    ...panels.flatMap((panel) => panel.routes),
    ...fixedRoutes,
  ].flatMap((route) => route.route)
  const minX = Math.min(...allPoints.map((point) => point.x)) - 0.3
  const maxX = Math.max(...allPoints.map((point) => point.x)) + 0.3
  const minY = Math.min(...allPoints.map((point) => point.y)) - 0.3
  const maxY = Math.max(...allPoints.map((point) => point.y)) + 0.3
  const panelWidth = 480,
    headerHeight = 138,
    height = 540
  const bodies = panels.map((panel, index) => {
    const graphics: GraphicsObject = {
      lines: [],
      circles: [],
      rects: [
        {
          center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
          width: maxX - minX,
          height: maxY - minY,
          fill: "none",
          stroke: "none",
        },
      ],
    }
    for (const route of [...panel.routes, ...fixedRoutes]) {
      const color = route.connectionName === "neighbor" ? "#b91c1c" : "#147d64"
      for (let pi = 1; pi < route.route.length; pi++) {
        const a = route.route[pi - 1]!,
          b = route.route[pi]!
        if (a.z !== layer || b.z !== layer) continue
        graphics.lines!.push({
          points: [a, b],
          strokeColor: color,
          strokeWidth: Math.max(
            a.traceThickness ?? route.traceThickness,
            b.traceThickness ?? route.traceThickness,
          ),
          layer: `z${layer}`,
        })
      }
      for (const via of route.vias) {
        graphics.circles!.push({
          center: via,
          radius: route.viaDiameter / 2,
          fill: "#2563eb",
          layer: `z${layer}`,
        })
        graphics.circles!.push({
          center: via,
          radius: 0.055,
          fill: "white",
          layer: `z${layer}`,
        })
      }
    }
    for (const obstacle of obstacles) {
      if (obstacle.shape === "circle")
        graphics.circles!.push({
          center: obstacle.center,
          radius: obstacle.width / 2,
          fill: "#f59e0b",
        })
      else graphics.rects!.push({ ...obstacle, fill: "#f59e0b" })
    }
    const svg = getSvgFromGraphicsObject(graphics, {
      backgroundColor: "white",
      svgWidth: panelWidth - 24,
      svgHeight: height - headerHeight - 24,
      hideInlineLabels: true,
    })
    const body = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"))
    const matrix = computeTransformFromViewbox(
      getBounds(graphics),
      panelWidth - 24,
      height - headerHeight - 24,
      { yFlip: true },
    )
    const cx = matrix.a * detailCenter.x + matrix.e
    const cy = matrix.d * detailCenter.y + matrix.f
    const zoomWidth = 0.65 * matrix.a,
      zoomHeight = 0.55 * matrix.a
    const inset = `<rect x="18" y="156" width="174" height="176" rx="8" fill="white" stroke="#94a3b8"/><text x="27" y="177" font-size="12" fill="#31465a">CONTACT / GAP DETAIL</text><svg x="23" y="185" width="164" height="139" viewBox="${cx - zoomWidth / 2} ${cy - zoomHeight / 2} ${zoomWidth} ${zoomHeight}">${body}</svg>`
    const stroke = focus === index ? "#2563eb" : "#d5dce5"
    const titleColor = index === 1 ? "#b91c1c" : "#142e44"
    return `<g transform="translate(${index * panelWidth} 0)"><rect x="2" y="2" width="476" height="536" rx="12" fill="white" stroke="${stroke}" stroke-width="${focus === index ? 4 : 1}"/><text x="18" y="35" font-size="21" font-weight="700" fill="${titleColor}">${panel.title}</text>${panel.details.map((line, i) => `<text x="18" y="${66 + i * 23}" font-size="14" fill="#31465a">${line}</text>`).join("")}<g transform="translate(12 ${headerHeight})">${body}</g>${inset}</g>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth * panels.length}" height="${height}" viewBox="0 0 ${panelWidth * panels.length} ${height}" font-family="Arial, sans-serif"><rect width="100%" height="100%" fill="white"/>${bodies.join("")}</svg>`
}
