import type { HighDensityRoute } from "../../types/high-density-types"

export const getViaTransitionPointIndices = (
  route: HighDensityRoute,
  via: { x: number; y: number },
): Set<number> => {
  const indices = new Set<number>()
  for (let i = 1; i < route.route.length; i++) {
    const a = route.route[i - 1]!
    const b = route.route[i]!
    if (
      a.z === b.z ||
      a.x !== via.x ||
      a.y !== via.y ||
      b.x !== via.x ||
      b.y !== via.y
    )
      continue
    let start = i - 1
    let end = i
    while (
      start > 0 &&
      route.route[start - 1]!.x === via.x &&
      route.route[start - 1]!.y === via.y
    )
      start--
    while (
      end + 1 < route.route.length &&
      route.route[end + 1]!.x === via.x &&
      route.route[end + 1]!.y === via.y
    )
      end++
    for (let j = start; j <= end; j++) indices.add(j)
  }
  if (indices.size === 0) {
    throw new Error(
      `SameNetViaMergerSolver could not find transition for via at (${via.x}, ${via.y}) on "${route.connectionName}"`,
    )
  }
  return indices
}
