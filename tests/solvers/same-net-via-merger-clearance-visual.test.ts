import { expect, test } from "bun:test"
import {
  createClearanceFrames,
  copperGap,
  renderClearanceFrame,
} from "tests/fixtures/via-merge-clearance-visual"

test("visual repro: legacy merge violates clearance; repair chooses the other occupied site", async () => {
  const frames = createClearanceFrames()
  expect(copperGap(frames[0]!.routes)).toBeGreaterThan(0.1)
  expect(copperGap(frames[1]!.routes)).toBeLessThan(0.1)
  expect(copperGap(frames[2]!.routes)).toBeGreaterThan(0.1)
  expect(frames[1]!.routes[1]!.vias).toEqual([{ x: -0.1, y: 0 }])
  expect(frames[2]!.routes[0]!.vias).toEqual([{ x: 0, y: 0 }])
  for (let i = 0; i < frames.length; i++) {
    await expect(renderClearanceFrame(frames[i]!)).toMatchSvgSnapshot(
      import.meta.path,
      { svgName: String(i + 1), scale: 1 },
    )
  }
})
