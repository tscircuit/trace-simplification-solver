import Flatbush from "flatbush"

interface Point {
  x: number
  y: number
  z: number
}

type Segment = [Point, Point]

type SegmentWithId = [Point, Point, string]

type IndexedSegment = {
  segment: SegmentWithId
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type BucketCoordinate = `${number}x${number}`

export class SegmentTree {
  private readonly index: Flatbush | undefined
  private readonly indexedSegments: IndexedSegment[] = []
  CELL_SIZE = 0.4
  SEGMENT_MARGIN: number

  constructor(
    public segments: Segment[],
    segmentMargin = 0.4,
  ) {
    this.SEGMENT_MARGIN = segmentMargin
    const segmentIds = new Set<string>()

    for (const segment of segments) {
      const segmentKey = this.getSegmentKey(segment)
      if (segmentIds.has(segmentKey)) continue
      segmentIds.add(segmentKey)

      // Index integer bucket bounds, not exact geometry: sharing any bucket
      // must remain sufficient to select a conservative collision candidate.
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
      if (!(minX <= maxX && minY <= maxY)) continue
      this.indexedSegments.push({
        segment: [segment[0], segment[1], segmentKey],
        minX,
        minY,
        maxX,
        maxY,
      })
    }
    if (this.indexedSegments.length > 0) {
      this.index = new Flatbush(this.indexedSegments.length)
      for (const bounds of this.indexedSegments) {
        this.index.add(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
      }
      this.index.finish()
    }
  }

  getBucketKey(x: number, y: number): BucketCoordinate {
    return `${Math.floor(x / this.CELL_SIZE)}x${Math.floor(y / this.CELL_SIZE)}`
  }

  getSegmentKey(segment: Segment): string {
    return `${segment[0].x}-${segment[0].y}-${segment[0].z}-${segment[1].x}-${segment[1].y}-${segment[1].z}`
  }

  getSegmentsThatCouldIntersect(A: Point, B: Point): SegmentWithId[] {
    if (!this.index) return []

    // Calculate the margined bounding box of the query segment
    const minX = Math.min(A.x, B.x) - this.SEGMENT_MARGIN
    const minY = Math.min(A.y, B.y) - this.SEGMENT_MARGIN
    const maxX = Math.max(A.x, B.x) + this.SEGMENT_MARGIN
    const maxY = Math.max(A.y, B.y) + this.SEGMENT_MARGIN

    // Calculate min/max integer indices covered by the margined query bounds
    const minIndexX = Math.floor(minX / this.CELL_SIZE)
    const maxIndexX = Math.floor(maxX / this.CELL_SIZE)
    const minIndexY = Math.floor(minY / this.CELL_SIZE)
    const maxIndexY = Math.floor(maxY / this.CELL_SIZE)

    if (!(minIndexX <= maxIndexX && minIndexY <= maxIndexY)) return []
    const candidates = this.index.search(
      minIndexX,
      minIndexY,
      maxIndexX,
      maxIndexY,
    )
    candidates.sort((a, b) => {
      const aBounds = this.indexedSegments[a]
      const bBounds = this.indexedSegments[b]
      // The grid visited x, then y, then insertion order within each bucket.
      // Sort by the first shared bucket to preserve exactly that ordering.
      return (
        Math.max(minIndexX, aBounds.minX) - Math.max(minIndexX, bBounds.minX) ||
        Math.max(minIndexY, aBounds.minY) - Math.max(minIndexY, bBounds.minY) ||
        a - b
      )
    })
    return candidates.map((index) => this.indexedSegments[index].segment)
  }
}
