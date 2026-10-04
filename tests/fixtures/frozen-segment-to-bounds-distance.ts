// Frozen arithmetic and branches from @tscircuit/math-utils 0.0.36.
export interface FrozenPoint {
  x: number
  y: number
}

export interface FrozenBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function distance(first: FrozenPoint, second: FrozenPoint): number {
  const dx = first.x - second.x
  const dy = first.y - second.y
  return Math.sqrt(dx * dx + dy * dy)
}

function orientation(p: FrozenPoint, q: FrozenPoint, r: FrozenPoint): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
  if (val === 0) return 0
  return val > 0 ? 1 : 2
}

function onSegment(p: FrozenPoint, q: FrozenPoint, r: FrozenPoint): boolean {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  )
}

function doSegmentsIntersect(
  p1: FrozenPoint,
  q1: FrozenPoint,
  p2: FrozenPoint,
  q2: FrozenPoint,
): boolean {
  const o1 = orientation(p1, q1, p2)
  const o2 = orientation(p1, q1, q2)
  const o3 = orientation(p2, q2, p1)
  const o4 = orientation(p2, q2, q1)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p1, p2, q1)) return true
  if (o2 === 0 && onSegment(p1, q2, q1)) return true
  if (o3 === 0 && onSegment(p2, p1, q2)) return true
  if (o4 === 0 && onSegment(p2, q1, q2)) return true
  return false
}

function pointToSegmentDistance(
  p: FrozenPoint,
  v: FrozenPoint,
  w: FrozenPoint,
): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2
  if (l2 === 0) return distance(p, v)
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
  t = Math.max(0, Math.min(1, t))
  const projection = {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y),
  }
  return distance(p, projection)
}

export function frozenSegmentToBoundsMinDistance(
  a: FrozenPoint,
  b: FrozenPoint,
  bounds: FrozenBounds,
): number {
  const topLeft = { x: bounds.minX, y: bounds.minY }
  const topRight = { x: bounds.maxX, y: bounds.minY }
  const bottomLeft = { x: bounds.minX, y: bounds.maxY }
  const bottomRight = { x: bounds.maxX, y: bounds.maxY }
  if (
    doSegmentsIntersect(a, b, topLeft, topRight) ||
    doSegmentsIntersect(a, b, topRight, bottomRight) ||
    doSegmentsIntersect(a, b, bottomRight, bottomLeft) ||
    doSegmentsIntersect(a, b, bottomLeft, topLeft)
  ) {
    return 0
  }
  if (
    a.x >= bounds.minX &&
    a.x <= bounds.maxX &&
    a.y >= bounds.minY &&
    a.y <= bounds.maxY &&
    b.x >= bounds.minX &&
    b.x <= bounds.maxX &&
    b.y >= bounds.minY &&
    b.y <= bounds.maxY
  ) {
    return 0
  }
  const distances = [
    pointToSegmentDistance(topLeft, a, b),
    pointToSegmentDistance(topRight, a, b),
    pointToSegmentDistance(bottomLeft, a, b),
    pointToSegmentDistance(bottomRight, a, b),
  ]
  if (
    a.x >= bounds.minX &&
    a.x <= bounds.maxX &&
    a.y >= bounds.minY &&
    a.y <= bounds.maxY
  ) {
    return 0
  }
  if (
    b.x >= bounds.minX &&
    b.x <= bounds.maxX &&
    b.y >= bounds.minY &&
    b.y <= bounds.maxY
  ) {
    return 0
  }
  if (
    a.x < bounds.minX ||
    a.x > bounds.maxX ||
    a.y < bounds.minY ||
    a.y > bounds.maxY
  ) {
    const closestX = Math.max(bounds.minX, Math.min(bounds.maxX, a.x))
    const closestY = Math.max(bounds.minY, Math.min(bounds.maxY, a.y))
    distances.push(distance(a, { x: closestX, y: closestY }))
  }
  if (
    b.x < bounds.minX ||
    b.x > bounds.maxX ||
    b.y < bounds.minY ||
    b.y > bounds.maxY
  ) {
    const closestX = Math.max(bounds.minX, Math.min(bounds.maxX, b.x))
    const closestY = Math.max(bounds.minY, Math.min(bounds.maxY, b.y))
    distances.push(distance(b, { x: closestX, y: closestY }))
  }
  return Math.min(...distances)
}
