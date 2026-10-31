export const mapLayerNameToZ = (layerName: string, layerCount: number) => {
  if (layerName === "top") return 0
  if (layerName === "bottom") return layerCount - 1
  if (!layerName.startsWith("inner")) return Number.NaN
  const parsed = Number(layerName.slice(5))
  return Number.isInteger(parsed) && parsed > 0 && parsed < layerCount - 1
    ? parsed
    : Number.NaN
}

export function getUniqueValidZLayers(
  zLayers: readonly number[],
  layerCount: number,
): number[] {
  return [...new Set(zLayers)]
    .filter((z) => Number.isInteger(z) && z >= 0 && z < layerCount)
    .sort((a, b) => a - b)
}

export function getUniqueValidZLayersFromLayerNames(
  layerNames: readonly string[],
  layerCount: number,
): number[] {
  return getUniqueValidZLayers(
    layerNames.map((layerName) => mapLayerNameToZ(layerName, layerCount)),
    layerCount,
  )
}
