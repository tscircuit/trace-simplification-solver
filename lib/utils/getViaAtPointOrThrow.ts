import type { HighDensityRoute } from "../types/high-density-types"

export const getViaAtPointOrThrow = (
  vias: HighDensityRoute["vias"],
  point: { x: number; y: number },
): HighDensityRoute["vias"][number] => {
  const via = vias.find((via) => via.x === point.x && via.y === point.y)
  if (!via) {
    throw new Error(`Missing via at layer transition (${point.x}, ${point.y})`)
  }
  return via
}
