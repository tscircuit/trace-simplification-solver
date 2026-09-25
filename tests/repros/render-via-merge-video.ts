// bun tests/repros/render-via-merge-video.ts <output-directory>
// Requires ffmpeg on PATH. Frames use the same geometry and renderer as the SVG regression.
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { Resvg } from "@resvg/resvg-js"
import {
  createClearanceFrames,
  renderClearanceFrame,
} from "../fixtures/via-merge-clearance-visual"

const directory = process.argv[2]
if (!directory) throw new Error("Provide an output directory")
mkdirSync(directory, { recursive: true })
for (const [i, frame] of createClearanceFrames().entries()) {
  await Bun.write(
    join(directory, `frame-${i}.png`),
    new Resvg(renderClearanceFrame(frame)).render().asPng(),
  )
}
const result = Bun.spawnSync(
  [
    "ffmpeg",
    "-y",
    "-framerate",
    "1/5",
    "-i",
    join(directory, "frame-%d.png"),
    "-c:v",
    "libx264",
    "-r",
    "30",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    join(directory, "via-merge-clearance.mp4"),
  ],
  { stdout: "inherit", stderr: "inherit" },
)
if (result.exitCode !== 0) throw new Error("ffmpeg failed")
