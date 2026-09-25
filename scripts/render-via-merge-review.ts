import { Resvg } from "@resvg/resvg-js"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { getViaMergeComparisonSvg } from "../tests/fixtures/getViaMergeComparisonSvg"
import { createViaMergeReviewCase } from "../tests/fixtures/via-merge-review-cases"

// Uses the same solved fixtures and measurements as the visual regression tests.
const frameDir = resolve("tmp/via-merge-review-frames")
mkdirSync(frameDir, { recursive: true })
mkdirSync("docs/via-merge-review", { recursive: true })
const frames: Array<{ path: string; duration: number }> = []
const addFrame = (svg: string, duration: number): void => {
  const path = `${frameDir}/${frames.length}.png`
  writeFileSync(path, new Resvg(svg).render().asPng())
  frames.push({ path, duration })
}
const card = (title: string, lines: string[]): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="810" font-family="Arial, sans-serif"><rect width="1440" height="810" fill="#f5f8fc"/><rect x="70" y="90" width="1300" height="620" rx="24" fill="white" stroke="#d5dce5"/><text x="120" y="205" font-size="38" font-weight="700" fill="#142e44">${title}</text>${lines.map((line, i) => `<text x="120" y="${290 + i * 64}" font-size="25" fill="#31465a">${line}</text>`).join("")}</svg>`
addFrame(
  card("Why a short via merge can still be unsafe", [
    "Three minimal repros from trace-simplification-solver PR #7.",
    "Each panel shows actual solver input or output, at physical copper widths.",
    "The magnified inset shows the gap or contact being tested.",
    "Captions are built into the video; no audio is required.",
  ]),
  7,
)
for (const name of ["wire", "branch", "pad"] as const) {
  const example = createViaMergeReviewCase(name)
  for (let focus = 0; focus < 3; focus++) {
    const comparison = getViaMergeComparisonSvg({
      panels: example.panels,
      fixedRoutes: example.input.otherHdRoutes,
      obstacles: example.input.obstacles,
      layer: example.layer,
      detailCenter: example.detailCenter,
      focus,
    })
    const body = comparison.slice(
      comparison.indexOf(">") + 1,
      comparison.lastIndexOf("</svg>"),
    )
    addFrame(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="810" font-family="Arial, sans-serif"><rect width="1440" height="810" fill="#f5f8fc"/><text x="22" y="47" font-size="28" font-weight="700" fill="#142e44">${example.heading}</text><text x="22" y="87" font-size="18" fill="#31465a">${example.explanation}</text><g transform="translate(0 126)">${body}</g><text x="22" y="724" font-size="22" font-weight="700" fill="#142e44">${example.panels[focus]!.title}</text><text x="22" y="762" font-size="19" fill="#31465a">${example.panels[focus]!.details[focus === 1 ? 0 : 2]}</text></svg>`,
      7,
    )
  }
}
addFrame(
  card("A smaller, explicit candidate flow", [
    "1. Propose moving one physical via site, including every route that owns it.",
    "2. Check completed wires, foreign copper, the board edge, and old contacts.",
    "3. Yield the valid geometry without modifying the solver's current routes.",
    "The caller runs whole-board DRC before choosing a candidate.",
    "After acceptance, create fresh proposals from the accepted geometry.",
  ]),
  10,
)
const manifest = `${frameDir}/frames.txt`
writeFileSync(
  manifest,
  frames
    .map(({ path, duration }) => `file '${path}'\nduration ${duration}`)
    .join("\n") + `\nfile '${frames.at(-1)!.path}'\n`,
)
const result = spawnSync(
  process.env.FFMPEG_PATH ?? "ffmpeg",
  [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    manifest,
    "-vf",
    "fps=24",
    "-c:v",
    "libx264",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "docs/via-merge-review/walkthrough.mp4",
  ],
  { stdio: "inherit" },
)
if (result.error) throw result.error
if (result.status !== 0)
  throw new Error(`Video encoding failed: ${result.status}`)
console.log(
  `Wrote ${frames.reduce((total, frame) => total + frame.duration, 0)} seconds of tested fixture output.`,
)
