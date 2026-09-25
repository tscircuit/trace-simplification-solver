import { expect, test } from "bun:test"
import { getViaMergeComparisonSvg } from "tests/fixtures/getViaMergeComparisonSvg"
import { createViaMergeReviewCase } from "tests/fixtures/via-merge-review-cases"

test("explains the wire contact guarantee with before, unchecked, and checked geometry", () => {
  const example = createViaMergeReviewCase("wire")
  const [before, unchecked, checked] = example.measurements
  expect(before).toBeGreaterThan(0.1)
  expect(unchecked).toBeLessThan(0.1)
  expect(checked).toBeGreaterThan(0.1)
  expect(
    new Set(
      example.panels[2]!.routes.flatMap((route) =>
        route.vias.map((via) => `${via.x},${via.y}`),
      ),
    ).size,
  ).toBe(1)
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
