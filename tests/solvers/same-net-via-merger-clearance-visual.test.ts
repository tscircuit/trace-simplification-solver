import { expect, test } from "bun:test"
import {
  createClearanceFrames,
  copperGap,
  renderClearanceComparison,
} from "tests/fixtures/via-merge-clearance-visual"

test("visual repro: legacy merge violates clearance; repair chooses the other occupied site", async () => {
  const frames = createClearanceFrames()
  expect(copperGap(frames[0]!.routes)).toBeGreaterThan(0.1)
  expect(copperGap(frames[1]!.routes)).toBeLessThan(0.1)
  expect(copperGap(frames[2]!.routes)).toBeGreaterThan(0.1)
  expect(frames[1]!.routes[1]!.vias).toEqual([{ x: -0.1, y: 0 }])
  expect(frames[2]!.routes[0]!.vias).toEqual([{ x: 0, y: 0 }])
  await expect(renderClearanceComparison(frames)).toMatchSvgSnapshot(
    import.meta.path,
    { scale: 1 },
  )
})
