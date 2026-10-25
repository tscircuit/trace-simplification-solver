import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import { getLinearPointAtDistance } from "../fixtures/linearPathDistanceOracle"
import { expectPerformanceTable } from "../fixtures/performanceVisual"

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
  // Original inclusive lookup; independent of the production binary helper.
  const oldIndex = before["pathSegments"].findIndex(
    (segment) =>
      distance >= segment.startDistance && distance <= segment.endDistance,
  )
  const newIndex = after["findPathSegmentIndex"](distance)
  before["pathSegments"] = originalSegments[0]
  after["pathSegments"] = originalSegments[1]
  expect(newIndex).toBe(oldIndex)
  const oldPoint = getLinearPointAtDistance.call(before, distance)
  const newPoint = after["getPointAtDistance"](distance)
  expect(newPoint).toEqual(oldPoint)
  expect(reads[1].length).toBeLessThan(reads[0].length)
  const points = [oldPoint, newPoint].map(
    (point) => `(${point.x.toFixed(3)}, ${point.y.toFixed(3)}, z${point.z})`,
  )

  await expectPerformanceTable(
    import.meta.path,
    "Find the same route point with fewer path-segment reads",
    `Live indexed-read counts for cumulative distance ${distance}; the final validation read is included.`,
    [
      ["Path segments", originalSegments[0].length, originalSegments[1].length],
      ["Indexed segment reads", reads[0].length, reads[1].length],
      [
        "Read order",
        `${reads[0].slice(0, 3).join(" -> ")} -> ... -> ${reads[0].at(-1)}`,
        reads[1].join(" -> "),
      ],
      ["Returned segment index", oldIndex, newIndex],
      ["Interpolated route point", points[0], points[1]],
    ],
  )
})
