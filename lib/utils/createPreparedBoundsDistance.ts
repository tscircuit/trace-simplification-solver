import { doSegmentsIntersect } from "@tscircuit/math-utils"

interface Point {
  x: number
  y: number
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function pointToPreparedSegmentDistanceSquared(
  point: Point,
  start: Point,
  deltaX: number,
  deltaY: number,
  lengthSquared: number,
): number {
  if (lengthSquared === 0) {
    const distanceX = point.x - start.x
    const distanceY = point.y - start.y
    return distanceX * distanceX + distanceY * distanceY
  }
  let t =
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
    lengthSquared
  t = Math.max(0, Math.min(1, t))
  const distanceX = point.x - (start.x + t * deltaX)
  const distanceY = point.y - (start.y + t * deltaY)
  return distanceX * distanceX + distanceY * distanceY
}

/** Prepare only the rectangle that stays fixed during one constructor call. */
export function createPreparedBoundsDistance(
  bounds: Bounds,
): (start: Point, end: Point) => number {
  const topLeft: Point = { x: bounds.minX, y: bounds.minY }
  const topRight: Point = { x: bounds.maxX, y: bounds.minY }
  const bottomLeft: Point = { x: bounds.minX, y: bounds.maxY }
  const bottomRight: Point = { x: bounds.maxX, y: bounds.maxY }

  return (start: Point, end: Point): number => {
    // Keep the original edge order and intersection predicate, including its
    // behavior for degenerate rectangles and non-finite coordinates.
    if (
      doSegmentsIntersect(start, end, topLeft, topRight) ||
      doSegmentsIntersect(start, end, topRight, bottomRight) ||
      doSegmentsIntersect(start, end, bottomRight, bottomLeft) ||
      doSegmentsIntersect(start, end, bottomLeft, topLeft)
    ) {
      return 0
    }
    if (
      start.x >= bounds.minX &&
      start.x <= bounds.maxX &&
      start.y >= bounds.minY &&
      start.y <= bounds.maxY &&
      end.x >= bounds.minX &&
      end.x <= bounds.maxX &&
      end.y >= bounds.minY &&
      end.y <= bounds.maxY
    ) {
      return 0
    }

    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const lengthSquared = deltaX ** 2 + deltaY ** 2
    const topLeftDistance = pointToPreparedSegmentDistanceSquared(
      topLeft,
      start,
      deltaX,
      deltaY,
      lengthSquared,
    )
    const topRightDistance = pointToPreparedSegmentDistanceSquared(
      topRight,
      start,
      deltaX,
      deltaY,
      lengthSquared,
    )
    const bottomLeftDistance = pointToPreparedSegmentDistanceSquared(
      bottomLeft,
      start,
      deltaX,
      deltaY,
      lengthSquared,
    )
    const bottomRightDistance = pointToPreparedSegmentDistanceSquared(
      bottomRight,
      start,
      deltaX,
      deltaY,
      lengthSquared,
    )

    if (
      start.x >= bounds.minX &&
      start.x <= bounds.maxX &&
      start.y >= bounds.minY &&
      start.y <= bounds.maxY
    ) {
      return 0
    }
    if (
      end.x >= bounds.minX &&
      end.x <= bounds.maxX &&
      end.y >= bounds.minY &&
      end.y <= bounds.maxY
    ) {
      return 0
    }

    let startDistance = Infinity
    let endDistance = Infinity
    if (
      start.x < bounds.minX ||
      start.x > bounds.maxX ||
      start.y < bounds.minY ||
      start.y > bounds.maxY
    ) {
      const closestX = Math.max(bounds.minX, Math.min(bounds.maxX, start.x))
      const closestY = Math.max(bounds.minY, Math.min(bounds.maxY, start.y))
      const distanceX = start.x - closestX
      const distanceY = start.y - closestY
      startDistance = distanceX * distanceX + distanceY * distanceY
    }
    if (
      end.x < bounds.minX ||
      end.x > bounds.maxX ||
      end.y < bounds.minY ||
      end.y > bounds.maxY
    ) {
      const closestX = Math.max(bounds.minX, Math.min(bounds.maxX, end.x))
      const closestY = Math.max(bounds.minY, Math.min(bounds.maxY, end.y))
      const distanceX = end.x - closestX
      const distanceY = end.y - closestY
      endDistance = distanceX * distanceX + distanceY * distanceY
    }
    // Square root is monotone on these nonnegative squared distances; taking
    // it after the minimum retains the original value, NaN and zero behavior.
    return Math.sqrt(
      Math.min(
        topLeftDistance,
        topRightDistance,
        bottomLeftDistance,
        bottomRightDistance,
        startDistance,
        endDistance,
      ),
    )
  }
}
