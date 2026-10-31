import type { Obstacle } from "../types"

/** Reserve requested hole clearance in geometry shared by uniform-margin passes. */
export const getTraceSimplificationObstacles = ({
  obstacles,
  minTraceToPadEdgeClearance,
  minTraceToHoleEdgeClearance,
}: {
  obstacles: ReadonlyArray<Obstacle>
  minTraceToPadEdgeClearance?: number
  minTraceToHoleEdgeClearance?: number
}): Obstacle[] => {
  // Path sampling uses 0.1 mm; via shortcuts may use a smaller pad margin.
  const margin = Math.min(0.1, minTraceToPadEdgeClearance ?? 0.15)
  const expansion = Math.max(
    0,
    (minTraceToHoleEdgeClearance ?? margin) - margin,
  )
  return obstacles.map(
    (obstacle): Obstacle =>
      obstacle.isNonPlatedHole && expansion > 0
        ? {
            ...obstacle,
            width: obstacle.width + 2 * expansion,
            height: obstacle.height + 2 * expansion,
          }
        : obstacle,
  )
}
