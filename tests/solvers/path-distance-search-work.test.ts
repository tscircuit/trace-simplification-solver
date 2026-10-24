import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"

test("long paths locate segments with logarithmic work", (): void => {
  const solver = new SingleSimplifiedPathSolver5({
    inputRoute: {
      connectionName: "long-path",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      vias: [],
      route: Array.from({ length: 4097 }, (_, index) => ({
        x: index / 10,
        y: (index % 3) / 20,
        z: 0,
      })),
    },
    otherHdRoutes: [],
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
  })
  const segments = solver["pathSegments"]
  let segmentReads = 0
  solver["pathSegments"] = new Proxy(segments, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) segmentReads++
      return Reflect.get(target, property, receiver)
    },
  })
  let linearComparisons = 0
  let queries = 0
  for (let index = 0; index < segments.length; index += 16) {
    const segment = segments[index]
    const distance = (segment.startDistance + segment.endDistance) / 2
    const expected = segments.findIndex((candidate) => {
      linearComparisons++
      return (
        distance >= candidate.startDistance && distance <= candidate.endDistance
      )
    })
    expect(solver["findPathSegmentIndex"](distance)).toBe(expected)
    queries++
  }
  expect(segmentReads).toBeLessThanOrEqual(
    queries * (Math.ceil(Math.log2(segments.length + 1)) + 1),
  )
  expect(segmentReads).toBeLessThan(linearComparisons / 100)
})
