import RBush from "rbush"
import type {
  HighDensityIntraNodeRoute,
  Jumper,
} from "../../types/high-density-types"
import { JUMPER_DIMENSIONS } from "../../utils/jumperSizes"

type RoutePoint = HighDensityIntraNodeRoute["route"][number]
type RouteSource = "fixed" | "mutable"

interface IndexedRouteFeatureBase {
  minX: number
  minY: number
  maxX: number
  maxY: number
  route: HighDensityIntraNodeRoute
  routeIndex: number
  routeSource: RouteSource
  featureIndex: number
}

export interface IndexedRouteSegment extends IndexedRouteFeatureBase {
  kind: "segment"
  start: RoutePoint
  end: RoutePoint
  traceThickness: number
}

export interface IndexedRouteVia extends IndexedRouteFeatureBase {
  kind: "via"
  center: { x: number; y: number }
  diameter: number
}

export interface IndexedRouteJumperPad extends IndexedRouteFeatureBase {
  kind: "jumper_pad"
  center: { x: number; y: number }
  width: number
  height: number
}

export type IndexedRouteFeature =
  | IndexedRouteSegment
  | IndexedRouteVia
  | IndexedRouteJumperPad

const getJumperPadSize = (
  jumper: Jumper,
): { width: number; height: number } => {
  const dimensions =
    JUMPER_DIMENSIONS[jumper.footprint] ?? JUMPER_DIMENSIONS["0603"]
  const isHorizontal =
    Math.abs(jumper.end.x - jumper.start.x) >
    Math.abs(jumper.end.y - jumper.start.y)
  return {
    width: isHorizontal ? dimensions.padLength : dimensions.padWidth,
    height: isHorizontal ? dimensions.padWidth : dimensions.padLength,
  }
}

const getRouteFeatures = ({
  route,
  routeIndex,
  routeSource,
}: {
  route: HighDensityIntraNodeRoute
  routeIndex: number
  routeSource: RouteSource
}): IndexedRouteFeature[] => {
  const features: IndexedRouteFeature[] = []
  for (
    let segmentIndex = 0;
    segmentIndex < route.route.length - 1;
    segmentIndex++
  ) {
    const start = route.route[segmentIndex]
    const end = route.route[segmentIndex + 1]
    features.push({
      kind: "segment",
      start,
      end,
      traceThickness: Math.max(
        start.traceThickness ?? route.traceThickness,
        end.traceThickness ?? route.traceThickness,
      ),
      route,
      routeIndex,
      routeSource,
      featureIndex: segmentIndex,
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y),
    })
  }

  for (let viaIndex = 0; viaIndex < route.vias.length; viaIndex++) {
    const center = route.vias[viaIndex]
    const radius = route.viaDiameter / 2
    features.push({
      kind: "via",
      center,
      diameter: route.viaDiameter,
      route,
      routeIndex,
      routeSource,
      featureIndex: viaIndex,
      minX: center.x - radius,
      minY: center.y - radius,
      maxX: center.x + radius,
      maxY: center.y + radius,
    })
  }

  for (
    let jumperIndex = 0;
    jumperIndex < (route.jumpers?.length ?? 0);
    jumperIndex++
  ) {
    const jumper = route.jumpers?.[jumperIndex]
    if (!jumper) continue
    const { width, height } = getJumperPadSize(jumper)
    for (const [padIndex, center] of [jumper.start, jumper.end].entries()) {
      features.push({
        kind: "jumper_pad",
        center,
        width,
        height,
        route,
        routeIndex,
        routeSource,
        featureIndex: jumperIndex * 2 + padIndex,
        minX: center.x - width / 2,
        minY: center.y - height / 2,
        maxX: center.x + width / 2,
        maxY: center.y + height / 2,
      })
    }
  }

  return features
}

const getMaximumTraceThickness = (route: HighDensityIntraNodeRoute): number =>
  Math.max(
    route.traceThickness,
    ...route.route.map((point) => point.traceThickness ?? route.traceThickness),
  )

export class SimplificationRouteObstacleIndex {
  private readonly tree = new RBush<IndexedRouteFeature>()
  private readonly fixedRouteCount: number
  private readonly mutableRouteCount: number
  private readonly featuresByMutableRouteIndex = new Map<
    number,
    IndexedRouteFeature[]
  >()
  readonly maximumTraceThickness: number

  constructor({
    fixedRoutes,
    routesToSimplify,
  }: {
    fixedRoutes: ReadonlyArray<HighDensityIntraNodeRoute>
    routesToSimplify: ReadonlyArray<HighDensityIntraNodeRoute>
  }) {
    this.fixedRouteCount = fixedRoutes.length
    this.mutableRouteCount = routesToSimplify.length
    const features = fixedRoutes.flatMap((route, routeIndex) =>
      getRouteFeatures({ route, routeIndex, routeSource: "fixed" }),
    )
    for (
      let routeIndex = 0;
      routeIndex < routesToSimplify.length;
      routeIndex++
    ) {
      const routeFeatures = getRouteFeatures({
        route: routesToSimplify[routeIndex],
        routeIndex,
        routeSource: "mutable",
      })
      this.featuresByMutableRouteIndex.set(routeIndex, routeFeatures)
      features.push(...routeFeatures)
    }
    this.maximumTraceThickness = Math.max(
      0,
      ...fixedRoutes.map(getMaximumTraceThickness),
      ...routesToSimplify.map(getMaximumTraceThickness),
    )
    this.tree.load(features)
  }

  replaceRoute({
    routeIndex,
    route,
  }: {
    routeIndex: number
    route: HighDensityIntraNodeRoute
  }): void {
    for (const feature of this.featuresByMutableRouteIndex.get(routeIndex) ??
      []) {
      this.tree.remove(feature)
    }
    const replacementFeatures = getRouteFeatures({
      route,
      routeIndex,
      routeSource: "mutable",
    })
    for (const feature of replacementFeatures) this.tree.insert(feature)
    this.featuresByMutableRouteIndex.set(routeIndex, replacementFeatures)
  }

  getNearbyFeatures({
    bounds,
    currentRouteIndex,
    margin,
  }: {
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
    currentRouteIndex: number
    margin: number
  }): IndexedRouteFeature[] {
    const getRouteOrder = (feature: IndexedRouteFeature): number => {
      if (feature.routeSource === "fixed") return feature.routeIndex
      if (feature.routeIndex > currentRouteIndex) {
        return this.fixedRouteCount + feature.routeIndex
      }
      return this.fixedRouteCount + this.mutableRouteCount + feature.routeIndex
    }

    return this.tree
      .search({
        minX: bounds.minX - margin,
        minY: bounds.minY - margin,
        maxX: bounds.maxX + margin,
        maxY: bounds.maxY + margin,
      })
      .filter(
        (feature) =>
          feature.routeSource === "fixed" ||
          feature.routeIndex !== currentRouteIndex,
      )
      .sort(
        (left, right) =>
          getRouteOrder(left) - getRouteOrder(right) ||
          left.featureIndex - right.featureIndex,
      )
  }
}
