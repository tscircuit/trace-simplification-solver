import { expect, test } from "bun:test"
import { SegmentTree } from "../../lib/data-structures/SegmentTree"
import { FrozenBucketSegmentTree } from "../fixtures/FrozenBucketSegmentTree"
import {
  afterColor,
  beforeColor,
  expectPerformanceSvg,
  performanceCanvas,
  visualMetric,
  visualPanel,
  visualText,
} from "../fixtures/performanceVisual"

type Segment = ConstructorParameters<typeof SegmentTree>[0][number]
type StoredRecord = {
  segment: [Segment[0], Segment[1], string]
  minX: number
  minY: number
  maxX: number
  maxY: number
}

test("compact segment storage keeps the same candidates without copying segments into every bucket", async (): Promise<void> => {
  const segments: Segment[] = [
    [
      { x: 0.1, y: 0.1, z: 0 },
      { x: 2.1, y: 2.1, z: 0 },
    ],
    [
      { x: 0.1, y: 2.1, z: 0 },
      { x: 2.1, y: 0.1, z: 0 },
    ],
    [
      { x: 0.5, y: 1.3, z: 1 },
      { x: 1.7, y: 1.3, z: 1 },
    ],
  ]
  const input = segments.concat([segments[0]])
  const before = new FrozenBucketSegmentTree(input, 0)
  const after = new SegmentTree(input, 0)
  const records = (after as unknown as { indexedSegments: StoredRecord[] })
    .indexedSegments
  const labels = new Map(
    segments.map((segment, index) => [
      before.getSegmentKey(segment),
      String.fromCharCode(65 + index),
    ]),
  )
  const label = (id: string): string => {
    const result = labels.get(id)
    if (!result) throw new Error(`Unknown fixture segment ${id}`)
    return result
  }
  const query = [
    { x: 1.1, y: -0.2, z: 0 },
    { x: 1.1, y: 2.3, z: 0 },
  ] as const
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
  const candidateOrder = newCandidates.map((candidate) => label(candidate[2]))
  expect({
    fixture: {
      uniqueSegments: segments.length,
      duplicateInputs: input.length - segments.length,
    },
    beforeGrid: {
      retainedSegmentTuples: oldEntries,
      materializedBuckets: before.buckets.size,
      candidateOrder: oldCandidates.map((candidate) => label(candidate[2])),
    },
    afterPackedIndex: {
      retainedSegmentRecords: records.length,
      candidateOrder,
    },
    preserved: {
      candidateValues: true,
      candidateOrder: true,
      endpointObjectReferences: true,
    },
  }).toMatchSnapshot(
    "same ordered collision candidates with fewer stored segment copies",
  )

  const graphics = performanceCanvas(
    "Store each segment once instead of once per covered grid cell",
    "A and B share a 6 x 6 bucket rectangle. C covers one row. Both implementations also ignore a repeated A input.",
  )
  visualPanel(
    graphics,
    24,
    "Before: duplicate tuples in grid buckets",
    `${before.buckets.size} buckets retain ${oldEntries} segment tuples.`,
    beforeColor,
  )
  const cell = 42
  for (const [key, bucket] of before.buckets) {
    const [x, y] = key.split("x").map(Number)
    const center = { x: 70 + (x + 0.5) * cell, y: 450 - (y + 0.5) * cell }
    graphics.rects.push({
      center,
      width: cell,
      height: cell,
      fill: bucket.length > 2 ? "#fed7aa" : "#fff7ed",
      stroke: "#d6d3d1",
    })
    visualText(
      graphics,
      center.x - 12,
      center.y,
      bucket.map((candidate) => label(candidate[2])).join(""),
      13,
      beforeColor,
    )
  }
  visualText(graphics, 344, 242, "Each cell stores", 17)
  visualText(graphics, 344, 268, "another A/B tuple.", 17, beforeColor)
  visualText(graphics, 344, 320, "Darker cells also", 16)
  visualText(graphics, 344, 346, "store a C tuple.", 16)
  visualText(
    graphics,
    70,
    471,
    "Cell size: 0.4 mm; labels identify stored tuples.",
    13,
    "#64748b",
  )

  visualPanel(
    graphics,
    624,
    "After: one indexed record per segment",
    `${records.length} unique records retain the same bucket bounds.`,
    afterColor,
  )
  for (const [index, record] of records.entries()) {
    const top = 206 + index * 83
    graphics.rects.push({
      center: { x: 898, y: top + 28 },
      width: 496,
      height: 64,
      fill: "#f0fdf4",
      stroke: "#86bba5",
    })
    visualText(
      graphics,
      668,
      top + 18,
      `${label(record.segment[2])}: one segment record`,
      19,
      afterColor,
    )
    visualText(
      graphics,
      668,
      top + 43,
      `bucket x ${record.minX}..${record.maxX}, y ${record.minY}..${record.maxY}`,
      15,
      "#475569",
    )
  }
  visualText(
    graphics,
    44,
    494,
    `Query candidate order: ${candidateOrder.join(" -> ")}`,
    16,
    beforeColor,
  )
  visualText(
    graphics,
    644,
    494,
    `Same candidate order: ${candidateOrder.join(" -> ")}`,
    16,
    afterColor,
  )
  visualMetric(
    graphics,
    "Retained segment entries for this same input",
    oldEntries,
    records.length,
    "The live test verifies identical candidates, order and endpoint references before creating this snapshot.",
  )
  await expectPerformanceSvg(graphics, import.meta.path)
})
