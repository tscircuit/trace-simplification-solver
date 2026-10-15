import type { HighDensityRoute } from "../types/high-density-types"

export const getMaximumViaDiameter = (route: HighDensityRoute): number => {
  let diameter = route.viaDiameter
  for (const via of route.vias) {
    diameter = Math.max(diameter, via.diameter ?? route.viaDiameter)
  }
  return diameter
}
