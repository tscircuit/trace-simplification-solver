import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import { stackSvgsHorizontally } from "stack-svgs"
import type { HighDensityRoute } from "lib/types/high-density-types"
import type { CrossingViaReductionSolver } from "lib/solvers/CrossingViaReductionSolver/crossing-via-reduction-solver"

const escapeXml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

function panel(
  graphics: GraphicsObject,
  routes: HighDensityRoute[],
  title: string,
  details: string[],
): string {
  const drawing = getSvgFromGraphicsObject(graphics, {
    backgroundColor: "#0d1b2a",
    svgWidth: 600,
    svgHeight: 540,
    hideInlineLabels: true,
  })
  const points = routes[1]!.route
    .slice(0, 4)
    .map(
      (p, i) =>
        `${i}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, layer ${p.z}) | next: ${p.toNextSegmentType ?? "wire"}${p.toNextSegmentCircuitJsonMetadata ? " [plated hole]" : ""}${p.pcb_port_id ? " [terminal]" : ""}`,
    )
  const viaCount = routes.reduce((sum, route) => sum + route.vias.length, 0)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="820" viewBox="0 0 600 820"><rect width="600" height="820" fill="#fff"/><g font-family="monospace" fill="#111"><text x="16" y="25" font-size="18" font-weight="bold">${escapeXml(title)} — ${viaCount} vias</text>${details.map((line, i) => `<text x="16" y="${49 + i * 20}" font-size="12">${escapeXml(line)}</text>`).join("")}</g><svg x="0" y="120" width="600" height="540">${drawing}</svg><g font-family="monospace" font-size="11" fill="#111"><text x="16" y="684" font-weight="bold">First four points of the transition route (actual data):</text>${points.map((line, i) => `<text x="16" y="${709 + i * 23}">${escapeXml(line)}</text>`).join("")}</g></svg>`
}

/** Render the solver's board-world XY geometry in mm and its actual segment metadata. */
export function getCrossingTransitionComparisonSvg(
  solver: CrossingViaReductionSolver,
  beforeGraphics: GraphicsObject,
  beforeRoutes: HighDensityRoute[],
  error?: Error,
): string {
  return stackSvgsHorizontally(
    [
      panel(beforeGraphics, beforeRoutes, "INPUT", [
        "Coincident XYZ points may carry different outgoing edges.",
        "Layer 0 = top; layer 1 = bottom. Rings mark vias.",
        "The outgoing plated-hole marker must survive deduplication.",
      ]),
      panel(
        solver.visualize(),
        solver.getReducedHdRoutes(),
        error ? "FAILED REDUCTION" : "REDUCED OUTPUT",
        error
          ? [
              "Observed: solver rejects a valid obstacle transition.",
              ...(error.message
                .match(/.{1,66}(?:\s|$)/g)
                ?.map((line) => line.trim()) ?? []),
            ]
          : [
              "Observed: two detour vias removed; one crossing via remains.",
              "The route metadata below records the retained outgoing edge.",
              "Terminal identity must survive; stale edge markers must not.",
            ],
      ),
    ],
    { gap: 20, normalizeSize: false },
  )
}
