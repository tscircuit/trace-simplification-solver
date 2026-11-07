import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import type { HighDensityRoute } from "../../../index"
import source from "./source.json"

type Input = { inputRoute: HighDensityRoute; otherHdRoutes: HighDensityRoute[] }

/** The solver receives the full capture; only this output view is cropped. */
export function getRvboyViaAnchorView(
  input: Input,
  result: HighDensityRoute,
): string {
  const { minX, maxX, minY, maxY } = source.viewbox
  const invalidTransitions = result.route.slice(1).filter((point, index) => {
    const previous = result.route[index]!
    return (
      previous.z !== point.z &&
      previous.toNextSegmentType !== "through_obstacle" &&
      (previous.x !== point.x || previous.y !== point.y)
    )
  }).length
  const graphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    rects: [
      {
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        width: maxX - minX,
        height: maxY - minY,
        fill: "none",
        stroke: "none",
        label: "rvboy-viewport",
      },
    ],
    lines: [...input.otherHdRoutes, result].flatMap((route) =>
      route.route.slice(1).flatMap((point, index) => {
        const previous = route.route[index]!
        if (previous.z !== point.z || ![0, 3].includes(point.z)) return []
        return [
          {
            points: [previous, point],
            strokeColor:
              route === result
                ? point.z === 0
                  ? "#047857"
                  : "#1d4ed8"
                : "#cbd5e1",
            strokeWidth: route.traceThickness,
            ...(point.z === 3 ? { strokeDash: [0.04, 0.02] } : {}),
          },
        ]
      }),
    ),
    circles: result.vias.map((via) => ({
      center: via,
      radius: result.viaDiameter / 2,
      fill: "#bae6fd",
      stroke: "#0369a1",
      strokeWidth: 0.01,
    })),
  }
  const svg = getSvgFromGraphicsObject(graphics, {
    backgroundColor: "white",
    svgWidth: 800,
    svgHeight: 800,
    includeTextLabels: false,
  })
  const frame = svg.match(/<rect\b[^>]*data-label="rvboy-viewport"[^>]*\/>/)
  if (!frame) throw new Error("Missing RVboy viewport")
  const coordinates = ["x", "y", "width", "height"].map((attribute) => {
    const match = frame[0].match(new RegExp(`\\s${attribute}="([^"]+)"`))
    if (!match) throw new Error(`Missing viewport ${attribute}`)
    return Number(match[1])
  })
  const cropped = svg.replace(
    /<svg\b[^>]*>/,
    `<svg x="0" y="80" width="800" height="800" viewBox="${coordinates.join(" ")}" overflow="hidden" xmlns="http://www.w3.org/2000/svg">`,
  )
  return `<svg width="800" height="880" viewBox="0 0 800 880" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="20" y="28" font-family="sans-serif" font-size="20">RVboy via anchor — exact full input</text><text x="20" y="55" font-family="sans-serif" font-size="16">${invalidTransitions} invalid transitions; top green, bottom dashed blue</text>${cropped}</svg>`
}
