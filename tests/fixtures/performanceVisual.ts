import { expect } from "bun:test"
import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"

export async function expectPerformanceTable(
  testPath: string,
  title: string,
  subtitle: string,
  rows: readonly (readonly [string, string | number, string | number])[],
): Promise<void> {
  const height = 180 + rows.length * 48
  const graphics: GraphicsObject = {
    coordinateSystem: "screen",
    rects: [
      {
        center: { x: 550, y: height / 2 },
        width: 1100,
        height,
        fill: "transparent",
        stroke: "none",
      },
    ],
    texts: [
      [title],
      [subtitle],
      ["Metric", "Before", "After"],
      ...rows,
    ].flatMap((values, row) =>
      values.map((value, column) => ({
        x: [24, 424, 764][column],
        y: row < 2 ? 28 + row * 38 : 120 + (row - 2) * 48,
        text: String(value),
        fontSize: row === 0 ? 26 : row === 1 ? 16 : 18,
        color: row < 2 ? "#172033" : ["#172033", "#b45309", "#047857"][column],
        anchorSide: "center_left",
      })),
    ),
  }
  const svg = getSvgFromGraphicsObject(graphics, {
    backgroundColor: "white",
    svgWidth: 1100,
    svgHeight: height,
  })
  await expect(svg).toMatchSvgSnapshot(testPath, { scale: 1 })
}
