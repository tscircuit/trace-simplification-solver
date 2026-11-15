import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SameNetViaMergerSolver } from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"
import { minimumDistanceBetweenSegments } from "lib/utils/minimumDistanceBetweenSegments"
import { createViaMergeClearanceRoutes } from "./via-merge-clearance-routes"

export const copperGap = (routes: HighDensityRoute[]) => {
  const diagonal = routes.find((r) => r.connectionName === "diagonal")!
  const neighbor = routes.find((r) => r.connectionName === "neighbor")!
  return (
    minimumDistanceBetweenSegments(
      diagonal.route[0]!,
      diagonal.route[1]!,
      neighbor.route[0]!,
      neighbor.route[1]!,
    ) -
    (diagonal.traceThickness + neighbor.traceThickness) / 2
  )
}

export const createClearanceFrames = () => {
  const input = createViaMergeClearanceRoutes()
  const run = (repair: boolean) => {
    const solver = new SameNetViaMergerSolver({
      inputHdRoutes: input,
      obstacles: [],
      colorMap: {},
      layerCount: 2,
      preserveRouteEndpoints: true,
      clearanceConstraints: repair
        ? { traceMargin: 0.1, obstacleMargin: 0.1 }
        : undefined,
      connMap: new ConnectivityMap({
        power: ["left", "diagonal"],
        signal: ["neighbor"],
      }),
    })
    solver.solve()
    if (!solver.solved) throw new Error("Visual reproduction did not solve")
    return solver.getMergedViaHdRoutes()!
  }
  return [{ routes: input }, { routes: run(false) }, { routes: run(true) }]
}

export const renderClearanceComparison = (
  frames: ReturnType<typeof createClearanceFrames>,
): string => {
  const headings = [
    "INPUT: TWO NEARBY VIAS",
    "BUG: MERGE AT A",
    "FIX: MERGE AT B",
  ]
  const explanations = [
    [
      "A and B belong to the same net.",
      "The diagonal wire has enough clearance.",
    ],
    [
      "Moving B to A pulls the diagonal wire left.",
      "It enters the other net's required clearance.",
    ],
    ["Move A to B instead.", "The diagonal wire stays safely in place."],
  ]
  const panels = frames.map((frame, index) => {
    const offset = 32 + index * 470
    const x = (v: number) => offset + 100 + v * 270
    const y = (v: number) => 574 - v * 270
    const gap = copperGap(frame.routes)
    const parts = [
      `<text x="${offset}" y="166" font-size="21" font-weight="700">${headings[index]}</text>`,
      ...explanations[index]!.map(
        (line, i) =>
          `<text x="${offset}" y="${197 + i * 26}" font-size="18">${line}</text>`,
      ),
      `<defs><clipPath id="plot-${index}"><rect x="${offset}" y="246" width="438" height="390"/></clipPath></defs><g clip-path="url(#plot-${index})">`,
      `<rect x="${offset}" y="246" width="438" height="390" fill="#f4f7f5"/>`,
    ]
    for (const route of frame.routes) {
      const foreign = route.connectionName === "neighbor"
      for (let i = 1; i < route.route.length; i++) {
        const a = route.route[i - 1]!,
          b = route.route[i]!
        if (a.z !== 0 || b.z !== 0) continue
        const line = `x1="${x(a.x)}" y1="${y(a.y)}" x2="${x(b.x)}" y2="${y(b.y)}" stroke-linecap="round"`
        if (foreign)
          parts.push(
            `<line ${line} stroke="#f8d9c7" stroke-width="${(route.traceThickness + 0.2) * 270}"/>`,
          )
        parts.push(
          `<line ${line} stroke="${foreign ? "#c34e18" : "#168463"}" stroke-width="${route.traceThickness * 270}"/>`,
        )
      }
    }
    const sites = new Set<string>()
    const holes: string[] = []
    for (const route of frame.routes)
      for (const via of route.vias) {
        const key = `${via.x}:${via.y}`
        if (sites.has(key)) continue
        sites.add(key)
        parts.push(
          `<circle cx="${x(via.x)}" cy="${y(via.y)}" r="${route.viaDiameter * 135}" fill="#168463" stroke="#084b38" stroke-width="2"/>`,
        )
        holes.push(
          `<circle cx="${x(via.x)}" cy="${y(via.y)}" r="10" fill="white"/>`,
        )
      }
    parts.push(...holes, "</g>")
    const labels =
      index === 0
        ? [
            [-0.1, "A"],
            [0, "B"],
          ]
        : [[index === 1 ? -0.1 : 0, index === 1 ? "A" : "B"]]
    for (const [vx, label] of labels) {
      parts.push(
        `<text x="${x(Number(vx))}" y="632" text-anchor="middle" font-size="18" font-weight="700">${label}</text>`,
      )
    }
    parts.push(
      `<text x="${offset}" y="675" font-size="23" font-weight="700" fill="${index === 1 ? "#b52a25" : "#167348"}">Gap: ${gap.toFixed(4)} mm ${index === 1 ? "FAIL" : "PASS"}</text>`,
      `<text x="${offset}" y="705" font-size="18">${index === 1 ? "Below the required 0.1000 mm." : "Above the required 0.1000 mm."}</text>`,
    )
    return parts.join("\n")
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="850" viewBox="0 0 1440 850">
  <rect width="1440" height="850" fill="white"/>
  <g font-family="Arial, sans-serif" fill="#172c25">
    <text x="32" y="44" font-size="28" font-weight="700">Merging two vias can pull an attached wire too close to another net.</text>
    <text x="32" y="80" font-size="20">The old check considers the short move between vias. It misses the long wire that bends when a via moves.</text>
    <text x="32" y="112" font-size="20">The fix checks the resulting copper before accepting a merge, so it can choose the safe via instead.</text>
    ${panels.join("\n")}
    <line x1="32" y1="736" x2="1408" y2="736" stroke="#cbd5cf"/>
    <text x="32" y="771" font-size="18">Green: same-net wires and vias. Orange: another net. Pale orange: its 0.1 mm clearance zone.</text>
    <text x="32" y="802" font-size="18">A via connects board layers. Circles are via copper; white centers are holes. Wires continue off the left edge.</text>
    <text x="32" y="830" font-size="16">Actual solver input and outputs, shown at the same scale. Top layer close-up; bottom-layer wires also follow the vias.</text>
  </g></svg>`
}
