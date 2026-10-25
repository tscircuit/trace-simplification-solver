import { expect, test } from "bun:test"
import { SegmentTree } from "../../lib/data-structures/SegmentTree"
import { FrozenBucketSegmentTree } from "../fixtures/FrozenBucketSegmentTree"
import { expectPerformanceTable } from "../fixtures/performanceVisual"

test("compact segment storage keeps the same candidates without copying segments into every bucket", async (): Promise<void> => {
  const point = (x: number, y: number, z = 0) => ({ x, y, z })
  const segments: ConstructorParameters<typeof SegmentTree>[0] = [
    [point(0.1, 0.1), point(2.1, 2.1)],
    [point(0.1, 2.1), point(2.1, 0.1)],
    [point(0.5, 1.3, 1), point(1.7, 1.3, 1)],
  ]
  const input = segments.concat([segments[0]])
  const before = new FrozenBucketSegmentTree(input, 0)
  const after = new SegmentTree(input, 0)
  const records = after["indexedSegments"]
  const labels = new Map(
    segments.map((segment, index) => [
      before.getSegmentKey(segment),
      String.fromCharCode(65 + index),
    ]),
  )
  const query = [point(1.1, -0.2), point(1.1, 2.3)] as const
  const oldCandidates = before.getSegmentsThatCouldIntersect(...query)
  const newCandidates = after.getSegmentsThatCouldIntersect(...query)
  expect(newCandidates).toEqual(oldCandidates)
  for (let index = 0; index < oldCandidates.length; index++) {
    expect(newCandidates[index][0]).toBe(oldCandidates[index][0])
    expect(newCandidates[index][1]).toBe(oldCandidates[index][1])
  }
  const oldEntries = [...before.buckets.values()].reduce(
    (count, bucket) => count + bucket.length,
    0,
  )
  expect(records).toHaveLength(segments.length)
  expect(records.length).toBeLessThan(oldEntries)
  const orders = [oldCandidates, newCandidates].map((candidates) =>
    candidates.map((candidate) => labels.get(candidate[2])).join(" -> "),
  )
  expect(orders).toEqual(["A -> B -> C", "A -> B -> C"])

  await expectPerformanceTable(
    import.meta.path,
    "Store each segment once instead of once per covered grid cell",
    "Live storage counts: three segments and one repeated input. Identical query candidates and endpoint objects.",
    [
      ["Input segments", input.length, input.length],
      ["Retained segment entries", oldEntries, records.length],
      [
        "Storage layout",
        `${before.buckets.size} grid buckets`,
        "packed bucket bounds",
      ],
      ["Query candidate order", orders[0], orders[1]],
      ["Endpoint object references", "original objects", "original objects"],
    ],
  )
})
