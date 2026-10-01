import RBush from "rbush"
import type {
  HighDensityIntraNodeRoute,
  Jumper,
} from "../../types/high-density-types"
import { JUMPER_DIMENSIONS } from "../../utils/jumperSizes"

interface Point {
  x: number
  y: number
  z: number
}

type RouteSource = "other" | "unsimplified"

interface IndexedFeatureBase {
  minX: number
  minY: number
  maxX: number
  maxY: number
  route: HighDensityIntraNodeRoute
  routeIndex: number
  source: RouteSource
  featureIndex: number
}

export interface IndexedSegment extends IndexedFeatureBase {
  kind: "segment"
  start: Point
  end: Point
  traceThickness: number
}

export interface IndexedVia extends IndexedFeatureBase {
  kind: "via"
  center: { x: number; y: number }
  diameter: number
}

export interface IndexedJumperPad extends IndexedFeatureBase {
  kind: "jumper_pad"
  center: { x: number; y: number }
  width: number
  height: number
}

export type IndexedObstacleFeature =
  | IndexedSegment
  | IndexedVia
  | IndexedJumperPad

const getJumperPadSize = (
  jumper: Jumper,
): { width: number; height: number } => {
  const dimensions = JUMPER_DIMENSIONS[jumper.footprint]
  const isHorizontal =
    Math.abs(jumper.end.x - jumper.start.x) >
    Math.abs(jumper.end.y - jumper.start.y)
  return {
    width: isHorizontal ? dimensions.padLength : dimensions.padWidth,
    height: isHorizontal ? dimensions.padWidth : dimensions.padLength,
  }
}

const getIndexedFeatures = (params: {
  route: HighDensityIntraNodeRoute
  routeIndex: number
  source: RouteSource
}): IndexedObstacleFeature[] => {
  const features: IndexedObstacleFeature[] = []
  for (
    let segmentIndex = 0;
    segmentIndex < params.route.route.length - 1;
    segmentIndex++
  ) {
    const start = params.route.route[segmentIndex]
    const end = params.route.route[segmentIndex + 1]
    features.push({
      kind: "segment",
      start,
      end,
      traceThickness: Math.max(
        start.traceThickness ?? params.route.traceThickness,
        end.traceThickness ?? params.route.traceThickness,
      ),
      route: params.route,
      routeIndex: params.routeIndex,
      source: params.source,
      featureIndex: segmentIndex,
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y),
    })
  }
  for (let viaIndex = 0; viaIndex < params.route.vias.length; viaIndex++) {
    const via = params.route.vias[viaIndex]
    const radius = params.route.viaDiameter / 2
    features.push({
      kind: "via",
      center: via,
      diameter: params.route.viaDiameter,
      route: params.route,
      routeIndex: params.routeIndex,
      source: params.source,
      featureIndex: viaIndex,
      minX: via.x - radius,
      minY: via.y - radius,
      maxX: via.x + radius,
      maxY: via.y + radius,
    })
  }
  for (
    let jumperIndex = 0;
    jumperIndex < (params.route.jumpers?.length ?? 0);
    jumperIndex++
  ) {
    const jumper = params.route.jumpers?.[jumperIndex]
    if (!jumper) continue
    const { width, height } = getJumperPadSize(jumper)
    for (const [padIndex, center] of [jumper.start, jumper.end].entries()) {
      features.push({
        kind: "jumper_pad",
        center,
        width,
        height,
        route: params.route,
        routeIndex: params.routeIndex,
        source: params.source,
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

export class SimplificationObstacleIndex {
  private tree = new RBush<IndexedObstacleFeature>()
  private mutableFeaturesByRouteIndex = new Map<
    number,
    IndexedObstacleFeature[]
  >()
  private otherHdRoutes: ReadonlyArray<HighDensityIntraNodeRoute>
  private currentHdRoutes: HighDensityIntraNodeRoute[]

  constructor(params: {
    otherHdRoutes: ReadonlyArray<HighDensityIntraNodeRoute>
    unsimplifiedHdRoutes: HighDensityIntraNodeRoute[]
  }) {
    this.otherHdRoutes = params.otherHdRoutes
    this.currentHdRoutes = [...params.unsimplifiedHdRoutes]
    const features = this.otherHdRoutes.flatMap((route, routeIndex) =>
      getIndexedFeatures({ route, routeIndex, source: "other" }),
    )
    for (
      let routeIndex = 0;
      routeIndex < this.currentHdRoutes.length;
      routeIndex++
    ) {
      const routeFeatures = getIndexedFeatures({
        route: this.currentHdRoutes[routeIndex],
        routeIndex,
        source: "unsimplified",
      })
      this.mutableFeaturesByRouteIndex.set(routeIndex, routeFeatures)
      features.push(...routeFeatures)
    }
    this.tree.load(features)
  }

  replaceRoute(params: {
    routeIndex: number
    route: HighDensityIntraNodeRoute
  }): void {
    for (const feature of this.mutableFeaturesByRouteIndex.get(
      params.routeIndex,
    ) ?? []) {
      this.tree.remove(feature)
    }
    const replacementFeatures = getIndexedFeatures({
      route: params.route,
      routeIndex: params.routeIndex,
      source: "unsimplified",
    })
    for (const feature of replacementFeatures) {
      this.tree.insert(feature)
    }
    this.mutableFeaturesByRouteIndex.set(params.routeIndex, replacementFeatures)
    this.currentHdRoutes[params.routeIndex] = params.route
  }

  getNearbyFeatures(params: {
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
    currentRouteIndex: number
    margin: number
  }): IndexedObstacleFeature[] {
    const features = this.tree
      .search({
        minX: params.bounds.minX - params.margin,
        minY: params.bounds.minY - params.margin,
        maxX: params.bounds.maxX + params.margin,
        maxY: params.bounds.maxY + params.margin,
      })
      .filter(
        ({ source, routeIndex }) =>
          source === "other" || routeIndex !== params.currentRouteIndex,
      )
    const getRouteOrder = (feature: IndexedObstacleFeature): number => {
      if (feature.source === "other") return feature.routeIndex
      if (feature.routeIndex > params.currentRouteIndex) {
        return this.otherHdRoutes.length + feature.routeIndex
      }
      return (
        this.otherHdRoutes.length +
        this.currentHdRoutes.length +
        feature.routeIndex
      )
    }
    return features.sort(
      (a, b) =>
        getRouteOrder(a) - getRouteOrder(b) || a.featureIndex - b.featureIndex,
    )
  }

  getMaximumOtherTraceThickness(currentRouteIndex: number): number {
    let maximumTraceThickness = 0
    for (const route of this.otherHdRoutes) {
      maximumTraceThickness = Math.max(
        maximumTraceThickness,
        getMaximumTraceThickness(route),
      )
    }
    for (
      let routeIndex = 0;
      routeIndex < this.currentHdRoutes.length;
      routeIndex++
    ) {
      if (routeIndex === currentRouteIndex) continue
      maximumTraceThickness = Math.max(
        maximumTraceThickness,
        getMaximumTraceThickness(this.currentHdRoutes[routeIndex]),
      )
    }
    return maximumTraceThickness
  }
}
