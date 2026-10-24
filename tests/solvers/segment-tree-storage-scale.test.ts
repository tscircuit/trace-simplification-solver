import { expect, test } from "bun:test"
import type Flatbush from "flatbush"
import { SegmentTree } from "lib/data-structures/SegmentTree"

test("segment index storage scales with unique segments instead of covered bucket area", (): void => {
  const count = 2_000
  const segments: ConstructorParameters<typeof SegmentTree>[0] = Array.from(
    { length: count },
    (_, z) => [
      { x: -1_000_000, y: -1_000_000, z },
      { x: 1_000_000, y: 1_000_000, z },
    ],
  )
  const tree = new SegmentTree(segments.concat(segments))
  // Each diagonal covers over 25 trillion grid cells. Inspect retained storage
  // directly so this regression check does not depend on timing or GC behavior.
  const storage = tree as unknown as {
    index: Flatbush
    indexedSegments: unknown[]
  }
  expect(storage.index.numItems).toBe(count)
  expect(storage.indexedSegments).toHaveLength(count)
  expect(storage.index.data.byteLength).toBeLessThan(count * 100)
  const candidates = tree.getSegmentsThatCouldIntersect(
    { x: -1_000_000, y: -1_000_000, z: 0 },
    { x: 1_000_000, y: 1_000_000, z: 0 },
  )
  expect(candidates).toHaveLength(count)
  expect(candidates.map((candidate) => candidate[0].z)).toEqual(
    Array.from({ length: count }, (_, z) => z),
  )
  expect(
    tree.getSegmentsThatCouldIntersect(
      { x: 2_000_000, y: 2_000_000, z: 0 },
      { x: 3_000_000, y: 3_000_000, z: 0 },
    ),
  ).toEqual([])
})
