import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import { getLinearPointAtDistance } from "../fixtures/linearPathDistanceOracle"
import {
  afterColor,
  beforeColor,
  expectPerformanceSvg,
  performanceCanvas,
  visualMetric,
  visualPanel,
  visualText,
} from "../fixtures/performanceVisual"

test("binary distance lookup finds the same point with fewer path-segment reads", async (): Promise<void> => {
  const props = {
    inputRoute: {
      connectionName: "distance-search",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      vias: [],
      route: Array.from({ length: 33 }, (_, x) => ({ x, y: 0, z: 0 })),
    },
    otherHdRoutes: [],
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
  }
  const before = new SingleSimplifiedPathSolver5(props)
  const after = new SingleSimplifiedPathSolver5(props)
  const distance = 27.5
  const reads: number[][] = [[], []]
  const originalSegments = [before["pathSegments"], after["pathSegments"]]
  for (const [index, solver] of [before, after].entries()) {
    solver["pathSegments"] = new Proxy(originalSegments[index], {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property))
          reads[index].push(Number(property))
        return Reflect.get(target, property, receiver)
      },
    })
  }
  // This is the original inclusive linear lookup, independent of the new helper.
  const oldIndex = before["pathSegments"].findIndex(
    (segment) =>
      distance >= segment.startDistance && distance <= segment.endDistance,
  )
  const newIndex = after["findPathSegmentIndex"](distance)
  before["pathSegments"] = originalSegments[0]
  after["pathSegments"] = originalSegments[1]
  expect(newIndex).toBe(oldIndex)
  const point = after["getPointAtDistance"](distance)
  expect(point).toEqual(getLinearPointAtDistance.call(before, distance))
  const pointLabel = `${point.x.toFixed(3)}, ${point.y.toFixed(3)}`
  expect(reads[1].length).toBeLessThan(reads[0].length)
  expect({
    query: { distance, totalSegments: originalSegments[0].length },
    beforeLinearScan: { segmentReads: reads[0].length, readOrder: reads[0] },
    afterBinarySearch: { segmentReads: reads[1].length, readOrder: reads[1] },
    sameResult: { segmentIndex: newIndex, point },
  }).toMatchSnapshot(
    "same inclusive path segment and interpolated point with fewer reads",
  )

  const graphics = performanceCanvas(
    "Find the same point along a path without scanning its entire prefix",
    `One query at cumulative distance ${distance} across ${originalSegments[0].length} path segments. Colored boxes are actual indexed reads.`,
  )
  for (const [index, left, title, color] of [
    [0, 24, "Before: linear scan from the first segment", beforeColor],
    [1, 624, "After: binary search of cumulative distance", afterColor],
  ] as const) {
    visualPanel(
      graphics,
      left,
      title,
      `${reads[index].length} indexed reads; same segment ${newIndex} and point (${pointLabel}).`,
      color,
    )
    const scale = 480 / originalSegments[index].length
    graphics.lines.push({
      points: [
        { x: left + 30, y: 224 },
        { x: left + 510, y: 224 },
      ],
      strokeColor: "#2563eb",
      strokeWidth: props.inputRoute.traceThickness * scale,
    })
    graphics.lines.push({
      points: [
        { x: left + 30 + newIndex * scale, y: 224 },
        { x: left + 30 + (newIndex + 1) * scale, y: 224 },
      ],
      strokeColor: color,
      strokeWidth: props.inputRoute.traceThickness * scale,
    })
    graphics.circles.push({
      center: { x: left + 30 + point.x * scale, y: 224 },
      radius: 6,
      fill: "#0891b2",
      stroke: "#0891b2",
    })
    visualText(
      graphics,
      left + 30,
      264,
      `Same returned route point: (${pointLabel}, z${point.z})`,
      17,
      "#0891b2",
    )
    visualText(
      graphics,
      left + 30,
      308,
      "Segment indices (small labels count reads at that index)",
      14,
      "#475569",
    )
    for (let slot = 0; slot < originalSegments[index].length; slot++) {
      const count = reads[index].filter((read) => read === slot).length
      const x = left + 27 + (slot % 16) * 31
      const y = 330 + Math.floor(slot / 16) * 57
      graphics.rects.push({
        center: { x: x + 13, y: y + 18 },
        width: 27,
        height: 37,
        fill: count ? (index === 0 ? "#ffedd5" : "#dcfce7") : "#f8fafc",
        stroke: slot === newIndex ? "#0891b2" : "#cbd5e1",
      })
      visualText(
        graphics,
        x + 4,
        y + 12,
        String(slot),
        11,
        count ? color : "#64748b",
      )
      if (count) visualText(graphics, x + 4, y + 28, `${count} read`, 8, color)
    }
    const order =
      index === 0
        ? `${reads[index].slice(0, 3).join(" -> ")} -> ... -> ${reads[index].at(-1)}`
        : reads[index].join(" -> ")
    visualText(graphics, left + 27, 457, `Read order: ${order}`, 14, color)
    visualText(
      graphics,
      left + 27,
      487,
      "The final validation read is included in the count.",
      13,
      "#64748b",
    )
  }
  visualMetric(
    graphics,
    "Actual path-segment reads for the same distance query",
    reads[0].length,
    reads[1].length,
    "The live test verifies the same inclusive segment and exactly the same interpolated route point.",
  )
  await expectPerformanceSvg(graphics, import.meta.path)
})
