import { expect, test } from "bun:test"
import { ObstacleSpatialHashIndex } from "../lib/data-structures/ObstacleTree"
import { getVectorLength } from "../lib/utils/getVectorLength"
import { getUniqueValidZLayersFromLayerNames } from "../lib/utils/mapLayerNameToZ"

test("vector length uses repeatable arithmetic without overflowing or underflowing", () => {
  expect(getVectorLength(-9.643875714569969, -9.643875714569969)).toBe(
    13.638499829385374,
  )
  expect(getVectorLength(0, 0)).toBe(0)
  expect(getVectorLength(-0, -0)).toBe(0)
  expect(getVectorLength(3, -4)).toBe(5)
  expect(getVectorLength(-4, 3)).toBe(5)
  expect(getVectorLength(0, -7)).toBe(7)
  expect(getVectorLength(3 * 2 ** 700, 4 * 2 ** 700)).toBe(5 * 2 ** 700)
  expect(getVectorLength(3 * 2 ** -700, 4 * 2 ** -700)).toBe(5 * 2 ** -700)
  expect(getVectorLength(Number.MIN_VALUE, 0)).toBe(Number.MIN_VALUE)
  expect(getVectorLength(Number.POSITIVE_INFINITY, 1)).toBe(
    Number.POSITIVE_INFINITY,
  )
  expect(getVectorLength(Number.NEGATIVE_INFINITY, 1)).toBe(
    Number.POSITIVE_INFINITY,
  )
  expect(getVectorLength(Number.NaN, 1)).toBeNaN()
})

test("NativeObstacleTree indexes sub-cell obstacles crossing cell boundaries and supports dynamic insert", () => {
  const index = new ObstacleSpatialHashIndex("native", [])
  const boundaryObstacle = {
    type: "rect" as const,
    layers: ["top"],
    center: { x: 0.4, y: 0.4 },
    width: 0.1,
    height: 0.1,
    connectedTo: ["obs1"],
  }
  index.insert(boundaryObstacle)
  const hits = index.search({
    minX: 0.42,
    minY: 0.42,
    maxX: 0.48,
    maxY: 0.48,
  })
  expect(hits).toHaveLength(1)
  expect(hits[0]?.connectedTo).toEqual(["obs1"])
  expect(
    getUniqueValidZLayersFromLayerNames(
      ["top", "layer1", "inner1", "inner3", "bottom"],
      4,
    ),
  ).toEqual([0, 1, 3])
})
