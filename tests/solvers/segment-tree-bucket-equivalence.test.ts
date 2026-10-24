import { expect, test } from "bun:test"
import { SegmentTree } from "lib/data-structures/SegmentTree"
import { seededRandom } from "tests/fixtures/seeded-random"

type Segment = ConstructorParameters<typeof SegmentTree>[0][number]
type Point = Segment[0]
type Candidate = [Point, Point, string]

function segmentKey(segment: Segment): string {
  return `${segment[0].x}-${segment[0].y}-${segment[0].z}-${segment[1].x}-${segment[1].y}-${segment[1].z}`
}

// Retain the original grid algorithm as an independent behavior oracle.
class BucketReference {
  readonly buckets = new Map<string, Candidate[]>()
  CELL_SIZE = 0.4
  SEGMENT_MARGIN = 0.4

  constructor(segments: Segment[]) {
    const seen = new Set<string>()
    for (const segment of segments) {
      const key = segmentKey(segment)
      if (seen.has(key)) continue
      seen.add(key)
      const minX = Math.floor(
        Math.min(segment[0].x, segment[1].x) / this.CELL_SIZE,
      )
      const minY = Math.floor(
        Math.min(segment[0].y, segment[1].y) / this.CELL_SIZE,
      )
      const maxX = Math.floor(
        Math.max(segment[0].x, segment[1].x) / this.CELL_SIZE,
      )
      const maxY = Math.floor(
        Math.max(segment[0].y, segment[1].y) / this.CELL_SIZE,
      )
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const bucketKey = `${x}x${y}`
          const bucket = this.buckets.get(bucketKey)
          const candidate: Candidate = [segment[0], segment[1], key]
          if (bucket) bucket.push(candidate)
          else this.buckets.set(bucketKey, [candidate])
        }
      }
    }
  }

  search(a: Point, b: Point): Candidate[] {
    const result: Candidate[] = []
    const seen = new Set<string>()
    const minX = Math.floor(
      (Math.min(a.x, b.x) - this.SEGMENT_MARGIN) / this.CELL_SIZE,
    )
    const minY = Math.floor(
      (Math.min(a.y, b.y) - this.SEGMENT_MARGIN) / this.CELL_SIZE,
    )
    const maxX = Math.floor(
      (Math.max(a.x, b.x) + this.SEGMENT_MARGIN) / this.CELL_SIZE,
    )
    const maxY = Math.floor(
      (Math.max(a.y, b.y) + this.SEGMENT_MARGIN) / this.CELL_SIZE,
    )
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const bucket = this.buckets.get(`${x}x${y}`)
        if (!bucket) continue
        for (const candidate of bucket) {
          if (seen.has(candidate[2])) continue
          seen.add(candidate[2])
          result.push(candidate)
        }
      }
    }
    return result
  }
}

test("segment index exactly preserves grid candidates, order and endpoint references", (): void => {
  const boundaryCoordinates = [
    -0.8,
    -0.4 - Number.EPSILON,
    -0.4,
    -0.4 + Number.EPSILON,
    -0,
    0.4 - Number.EPSILON,
    0.4,
    0.4 + Number.EPSILON,
    0.8,
  ]
  for (let seed = 1; seed <= 12; seed++) {
    const random = seededRandom(seed)
    const point = (): Point => ({
      x: Math.round((random() - 0.5) * 120) / 20,
      y: Math.round((random() - 0.5) * 120) / 20,
      z: Math.floor(random() * 4),
    })
    const segments: Segment[] = [
      [
        { x: -20, y: -20, z: 0 },
        { x: 20, y: 20, z: 0 },
      ],
      [
        { x: 20, y: -20, z: 1 },
        { x: -20, y: 20, z: 1 },
      ],
      [
        { x: Number.NaN, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
      ],
    ]
    for (const coordinate of boundaryCoordinates) {
      segments.push([
        { x: coordinate, y: coordinate, z: 0 },
        { x: coordinate, y: coordinate, z: 0 },
      ])
      segments.push([
        { x: coordinate, y: coordinate, z: 1 },
        { x: coordinate, y: coordinate, z: 1 },
      ])
    }
    for (let i = 0; i < 100; i++) {
      const a = point()
      const b = i % 10 === 0 ? a : point()
      const segment: Segment = [a, b]
      segments.push(segment)
      if (i % 7 === 0) segments.push(structuredClone(segment), segment)
      if (i % 11 === 0) segments.push([b, a])
    }
    const reference = new BucketReference(segments)
    reference.SEGMENT_MARGIN = seed / 50
    const tree = new SegmentTree(segments, reference.SEGMENT_MARGIN)
    expect(
      tree.getSegmentsThatCouldIntersect(segments[0][0], segments[0][1]),
    ).toEqual(reference.search(segments[0][0], segments[0][1]))
    for (let i = 0; i < 250; i++) {
      const a =
        i < boundaryCoordinates.length
          ? { x: boundaryCoordinates[i], y: boundaryCoordinates[i], z: 0 }
          : point()
      const b = i % 3 === 0 ? a : point()
      // Changing query settings must leave the original stored grid intact.
      const margin = [0, 0.01, 0.4, 0.8, -0.05, -0.8][i % 6]
      tree.SEGMENT_MARGIN = reference.SEGMENT_MARGIN = margin
      tree.CELL_SIZE = reference.CELL_SIZE = [0.4, 0.2, 0.8][i % 3]
      const expected = reference.search(a, b)
      const actual = tree.getSegmentsThatCouldIntersect(a, b)
      expect(actual.map((candidate) => candidate[2])).toEqual(
        expected.map((candidate) => candidate[2]),
      )
      for (let j = 0; j < expected.length; j++) {
        expect(actual[j][0]).toBe(expected[j][0])
        expect(actual[j][1]).toBe(expected[j][1])
      }
      expect(tree.getBucketKey(a.x, a.y)).toBe(
        `${Math.floor(a.x / tree.CELL_SIZE)}x${Math.floor(a.y / tree.CELL_SIZE)}`,
      )
    }
    const a = { x: -20, y: -20, z: 0 }
    const b = { x: 20, y: 20, z: 0 }
    // As in the grid, endpoint objects remain live while indexed bounds and IDs
    // describe their geometry at construction time.
    segments[0][0].x = 100
    expect(tree.getSegmentsThatCouldIntersect(a, b)).toEqual(
      reference.search(a, b),
    )
    tree.SEGMENT_MARGIN = Number.NaN
    expect(tree.getSegmentsThatCouldIntersect(a, b)).toEqual([])
    tree.SEGMENT_MARGIN = 0.4
    expect(
      tree.getSegmentsThatCouldIntersect({ ...a, y: Number.NaN }, b),
    ).toEqual([])
  }
  const empty = new SegmentTree([])
  expect(
    empty.getSegmentsThatCouldIntersect(
      { x: -1, y: -1, z: 0 },
      { x: 1, y: 1, z: 0 },
    ),
  ).toEqual([])
})
