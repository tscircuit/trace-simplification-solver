import { expect } from "bun:test"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"

export type PerformanceGraphic = GraphicsObject &
  Required<
    Pick<GraphicsObject, "rects" | "lines" | "circles" | "texts" | "arrows">
  >

export const beforeColor = "#b45309"
export const afterColor = "#047857"

export function visualText(
  graphics: PerformanceGraphic,
  x: number,
  y: number,
  text: string,
  fontSize = 16,
  color = "#172033",
): void {
  graphics.texts.push({
    x,
    y,
    text,
    fontSize,
    color,
    anchorSide: "center_left",
  })
}

export function performanceCanvas(
  title: string,
  subtitle: string,
): PerformanceGraphic {
  const graphics: PerformanceGraphic = {
    coordinateSystem: "screen",
    rects: [
      {
        center: { x: 600, y: 350 },
        width: 1200,
        height: 700,
        fill: "transparent",
        stroke: "none",
      },
    ],
    lines: [],
    circles: [],
    texts: [],
    arrows: [],
  }
  visualText(graphics, 32, 38, title, 28)
  visualText(graphics, 32, 72, subtitle, 16, "#475569")
  return graphics
}

export function visualPanel(
  graphics: PerformanceGraphic,
  left: number,
  title: string,
  subtitle: string,
  color: string,
): void {
  graphics.rects.push({
    center: { x: left + 276, y: 308 },
    width: 552,
    height: 412,
    fill: "transparent",
    stroke: "#cbd5e1",
  })
  visualText(graphics, left + 20, 130, title, 22, color)
  visualText(graphics, left + 20, 158, subtitle, 14, "#475569")
}

export function visualMetric(
  graphics: PerformanceGraphic,
  label: string,
  before: number,
  after: number,
  preserved: string,
): void {
  visualText(graphics, 32, 552, label, 20)
  for (const [left, value, prefix, color] of [
    [48, before, "Before", beforeColor],
    [648, after, "After", afterColor],
  ] as const) {
    const width = (value / Math.max(before, after, 1)) * 440
    visualText(
      graphics,
      left,
      584,
      `${prefix}: ${value.toLocaleString("en-US")}`,
      23,
      color,
    )
    graphics.rects.push({
      center: { x: left + width / 2, y: 616 },
      width,
      height: 18,
      fill: color,
      stroke: "none",
    })
  }
  visualText(graphics, 32, 659, preserved, 15, afterColor)
  visualText(
    graphics,
    32,
    683,
    "Generated from live test observations. Shared bar scale; counts are not elapsed time or process RSS.",
    13,
    "#64748b",
  )
}

export async function expectPerformanceSvg(
  graphics: PerformanceGraphic,
  testPath: string,
): Promise<void> {
  const svg = getSvgFromGraphicsObject(graphics, {
    backgroundColor: "white",
    svgWidth: 1200,
    svgHeight: 700,
  })
  // These diagrams are already 1200 x 700 pixels; compare at native resolution
  // instead of applying the matcher's default 4x PCB-detail supersampling.
  await expect(svg).toMatchSvgSnapshot(testPath, { scale: 1 })
}
