import { expect, test } from "bun:test"
import { getViaMergeComparisonSvg } from "tests/fixtures/getViaMergeComparisonSvg"
import { createViaMergeReviewCase } from "tests/fixtures/via-merge-review-cases"

test("explains the branch contact guarantee with before, unchecked, and checked geometry", () => {
  const example = createViaMergeReviewCase("branch")
  const [before, unchecked, checked] = example.measurements
  expect(before).toBeLessThanOrEqual(0)
  expect(unchecked).toBeGreaterThan(0)
  expect(checked).toBeLessThanOrEqual(0)
  expect(example.panels[2]!.routes).toEqual(example.input.inputHdRoutes)
  expect(
    getViaMergeComparisonSvg({
      panels: example.panels,
      fixedRoutes: example.input.otherHdRoutes,
      obstacles: example.input.obstacles,
      layer: example.layer,
      detailCenter: example.detailCenter,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})
