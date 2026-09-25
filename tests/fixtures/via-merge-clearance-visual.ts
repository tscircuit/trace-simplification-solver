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
  return [
    {
      title: "1. INPUT",
      detail: "Two overlapping same-net vias; foreign wire is clear.",
      routes: input,
    },
    {
      title: "2. LEGACY MERGE",
      detail: "Moving the diagonal via left bends its wire too close.",
      routes: run(false),
    },
    {
      title: "3. CLEARANCE-PRESERVING MERGE",
      detail: "Reuse the right via; keep the diagonal wire unchanged.",
      routes: run(true),
    },
  ]
}

type Frame = ReturnType<typeof createClearanceFrames>[number]

export const renderClearanceFrame = (frame: Frame): string => {
  const gap = copperGap(frame.routes)
  const color = gap >= 0.1 ? "#167348" : "#bd302d"
  const draw = (
    bounds: { x: number; y: number; width: number; height: number },
    view: { x: number; y: number; width: number; height: number },
    id: string,
  ) => {
    const scale = Math.min(
      bounds.width / view.width,
      bounds.height / view.height,
    )
    const x = (v: number) => bounds.x + (v - view.x) * scale
    const y = (v: number) => bounds.y + bounds.height - (v - view.y) * scale
    const parts = [
      `<defs><clipPath id="${id}"><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}"/></clipPath></defs><g clip-path="url(#${id})">`,
    ]
    for (const route of frame.routes) {
      const stroke = route.connectionName === "neighbor" ? "#d45c27" : "#168463"
      for (let i = 1; i < route.route.length; i++) {
        const a = route.route[i - 1]!,
          b = route.route[i]!
        if (a.z !== 0 || b.z !== 0) continue
        if (route.connectionName === "neighbor")
          parts.push(
            `<line x1="${x(a.x)}" y1="${y(a.y)}" x2="${x(b.x)}" y2="${y(b.y)}" stroke="#fbe3d4" stroke-width="${(route.traceThickness + 0.2) * scale}" stroke-linecap="round"/>`,
          )
        parts.push(
          `<line x1="${x(a.x)}" y1="${y(a.y)}" x2="${x(b.x)}" y2="${y(b.y)}" stroke="${stroke}" stroke-width="${route.traceThickness * scale}" stroke-linecap="round"/>`,
        )
      }
    }
    const sites = new Set<string>()
    for (const route of frame.routes)
      for (const via of route.vias) {
        const key = `${via.x}:${via.y}`
        if (sites.has(key)) continue
        sites.add(key)
        parts.push(
          `<circle cx="${x(via.x)}" cy="${y(via.y)}" r="${(route.viaDiameter * scale) / 2}" fill="#168463" stroke="#084b38" stroke-width="2"/><circle cx="${x(via.x)}" cy="${y(via.y)}" r="${0.05 * scale}" fill="white"/>`,
        )
      }
    parts.push("</g>")
    return parts.join("\n")
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700">
    <rect width="1200" height="700" fill="white"/>
    <g font-family="Arial, sans-serif" fill="#172c25">
    <text x="36" y="44" font-size="25" font-weight="700">${frame.title}</text>
    <text x="36" y="78" font-size="20">${frame.detail}</text>
    <text x="36" y="126" font-size="18">TOP COPPER / millimeters</text>
    <text x="650" y="126" font-size="18">CLEARANCE DETAIL / same scale in all frames</text>
    <rect x="36" y="145" width="555" height="420" fill="#f4f7f5"/>
    <rect x="650" y="145" width="514" height="420" fill="#f4f7f5"/>
    ${draw({ x: 46, y: 155, width: 535, height: 400 }, { x: -2.2, y: -0.3, width: 3.5, height: 1.7 }, "overview")}
    ${draw({ x: 660, y: 155, width: 494, height: 400 }, { x: 0.32, y: 0.46, width: 0.55, height: 0.53 }, "detail")}
    <text x="36" y="607" font-size="21" fill="${color}" font-weight="700">Copper gap: ${gap.toFixed(4)} mm / required: 0.1000 mm / ${gap >= 0.1 ? "PASS" : "FAIL"}</text>
    <text x="36" y="643" font-size="18">Green: same net. Orange: foreign net. Pale orange: 0.1 mm clearance envelope.</text>
    <text x="36" y="675" font-size="16">Both layers follow the via; top layer shown. All frames are actual solver inputs or outputs.</text>
    </g></svg>`
}
