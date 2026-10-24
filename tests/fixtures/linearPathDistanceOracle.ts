import type { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "../../lib/types/high-density-types"

type RoutePoint = HighDensityRoute["route"][number]

// Preserve the original linear queries independently of the optimized helper.
export function getLinearPointAtDistance(
  this: SingleSimplifiedPathSolver5,
  distance: number,
): RoutePoint {
  distance = Math.max(0, Math.min(distance, this["totalPathLength"]))
  const segment = this["pathSegments"].find(
    (segment) =>
      distance >= segment.startDistance && distance <= segment.endDistance,
  )
  if (!segment) return this.inputRoute.route[this.inputRoute.route.length - 1]
  const factor = (distance - segment.startDistance) / segment.length
  return {
    x: segment.start.x + factor * (segment.end.x - segment.start.x),
    y: segment.start.y + factor * (segment.end.y - segment.start.y),
    z: factor < 0.5 ? segment.start.z : segment.end.z,
  }
}

export function getLinearNearestIndexForDistance(
  this: SingleSimplifiedPathSolver5,
  distance: number,
): number {
  if (distance <= 0) return 0
  if (distance >= this["totalPathLength"])
    return this.inputRoute.route.length - 1
  const index = this["pathSegments"].findIndex(
    (segment) =>
      distance >= segment.startDistance && distance <= segment.endDistance,
  )
  if (index === -1) return 0
  const segment = this["pathSegments"][index]
  const middle = (segment.startDistance + segment.endDistance) / 2
  return distance > middle ? index + 1 : index
}

export function appendLinearOriginalRouteSlice(
  this: SingleSimplifiedPathSolver5,
  startDistance: number,
  endIndexInclusive: number,
): void {
  const startIndex = this["pathSegments"].findIndex(
    (segment) =>
      startDistance >= segment.startDistance &&
      startDistance <= segment.endDistance,
  )
  if (startIndex === -1) {
    throw new Error(
      `Could not find path segment containing distance ${startDistance}`,
    )
  }
  for (
    let index = startIndex + 1;
    index <= endIndexInclusive && index < this.inputRoute.route.length;
    index++
  ) {
    const point = this.inputRoute.route[index]
    const previous = this.newRoute[this.newRoute.length - 1]
    if (
      previous &&
      previous.x === point.x &&
      previous.y === point.y &&
      previous.z === point.z
    )
      continue
    this.newRoute.push({ ...point })
  }
}
