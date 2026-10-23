import type { HighDensityRoute } from "../../types/high-density-types"
import { calculate45DegreePaths } from "../../utils/calculate45DegreePaths"
import { SingleSimplifiedPathSolver5 } from "./SingleSimplifiedPathSolver5_Deg45"

type RoutePoint = HighDensityRoute["route"][number]

/** Shortcuts vertices, then tightens axis-aligned detours between 45° legs. */
export class VertexShortcutPathSolver extends SingleSimplifiedPathSolver5 {
  private vertexIndex = 0
  private detourIndex = 0

  constructor(
    params: ConstructorParameters<typeof SingleSimplifiedPathSolver5>[0],
  ) {
    super(params)
    // Each scan advances at least one vertex per step.
    this.MAX_ITERATIONS = Math.max(
      this.MAX_ITERATIONS,
      2 * this.inputRoute.route.length,
    )
    this.newRoute = this.inputRoute.route
      .slice(0, 1)
      .map((point) => ({ ...point }))
    this.newVias = this.inputRoute.vias.map((via) => ({ ...via }))
  }

  override getSolverName(): string {
    return "VertexShortcutPathSolver"
  }

  override _step(): void {
    const points = this.inputRoute.route
    const start = points[this.vertexIndex]
    if (this.vertexIndex >= points.length - 1) {
      this.tightenNextDetour()
      return
    }

    // Layer transitions, terminals, width changes and jumper pads are anchors.
    let endIndex = this.vertexIndex + 1
    const lengths = [0]
    for (let index = this.vertexIndex; index < points.length - 1; index++) {
      const a = points[index]
      const b = points[index + 1]
      if (
        a.z !== b.z ||
        a.toNextSegmentType ||
        a.traceThickness !== b.traceThickness ||
        (a.traceThickness !== undefined &&
          a.traceThickness !== this.inputRoute.traceThickness) ||
        a.insideJumperPad ||
        b.insideJumperPad
      ) {
        break
      }
      lengths.push(lengths.at(-1)! + Math.hypot(b.x - a.x, b.y - a.y))
      endIndex = index + 1
      if (b.pcb_port_id || this.jumperPadPointIndices.has(endIndex)) break
    }

    for (
      let candidateIndex = endIndex;
      candidateIndex > this.vertexIndex + 1;
      candidateIndex--
    ) {
      const end = points[candidateIndex]
      const originalLength = lengths[candidateIndex - this.vertexIndex]
      for (const path of calculate45DegreePaths(start, end)) {
        const candidate: RoutePoint[] = path
          .filter(
            (point, index) =>
              index === 0 ||
              point.x !== path[index - 1].x ||
              point.y !== path[index - 1].y,
          )
          .map((point) => ({
            ...point,
            z: start.z,
            traceThickness: start.traceThickness,
          }))
        const length = candidate.reduce(
          (sum, point, index) =>
            index === 0
              ? sum
              : sum +
                Math.hypot(
                  point.x - candidate[index - 1].x,
                  point.y - candidate[index - 1].y,
                ),
          0,
        )
        if (
          candidate.length < 2 ||
          length > originalLength + 1e-9 ||
          (length >= originalLength - 1e-9 &&
            candidate.length >= candidateIndex - this.vertexIndex + 1) ||
          !this.isValidPath(candidate)
        ) {
          continue
        }

        // Keep metadata on the endpoint that anchors the next section.
        candidate[candidate.length - 1] = { ...end }
        this.newRoute.push(...candidate.slice(1))
        this.vertexIndex = candidateIndex
        return
      }
    }

    this.vertexIndex++
    this.newRoute.push({ ...points[this.vertexIndex] })
  }

  private tightenNextDetour(): void {
    // Jumper pad geometry is anchored by the preceding vertex pass. This pass
    // only moves ordinary copper corners, never a jumper-bearing route.
    if (
      this.detourIndex + 3 >= this.newRoute.length ||
      this.inputRoute.jumpers?.length
    ) {
      this.solved = true
      return
    }
    const index = this.detourIndex++
    const [a, b, c, d] = this.newRoute.slice(index, index + 4)
    if (b.pcb_port_id || c.pcb_port_id) return
    for (const [start, end] of [
      [a, b],
      [b, c],
      [c, d],
    ]) {
      if (
        start.z !== end.z ||
        start.toNextSegmentType ||
        start.toNextSegmentCircuitJsonMetadata ||
        start.insideJumperPad ||
        end.insideJumperPad ||
        start.traceThickness !== end.traceThickness ||
        (start.traceThickness !== undefined &&
          start.traceThickness !== this.inputRoute.traceThickness)
      )
        return
    }

    // Circuit-world mm (+X right, +Y up). Shift the middle segment along its
    // normal, intersecting its new position with the two unchanged 45° legs.
    const horizontal = Math.abs(c.y - b.y) < 1e-9
    const vertical = Math.abs(c.x - b.x) < 1e-9
    if (horizontal === vertical) return
    const normal = horizontal ? "y" : "x"
    const tangent = horizontal ? "x" : "y"
    const firstNormal = b[normal] - a[normal]
    const lastNormal = c[normal] - d[normal]
    if (Math.abs(firstNormal) < 1e-9 || Math.abs(lastNormal) < 1e-9) return
    const firstSlope = (b[tangent] - a[tangent]) / firstNormal
    const lastSlope = (c[tangent] - d[tangent]) / lastNormal
    if (
      Math.abs(Math.abs(firstSlope) - 1) > 1e-9 ||
      Math.abs(Math.abs(lastSlope) - 1) > 1e-9
    )
      return
    // Both fixed endpoints must lie on the same side of the detour.
    const direction = -Math.sign(firstNormal)
    if (direction !== -Math.sign(lastNormal)) return
    let maximumShift = Math.min(Math.abs(firstNormal), Math.abs(lastNormal))
    const middleLength = Math.abs(c[tangent] - b[tangent])
    const middleLengthChange =
      (lastSlope - firstSlope) * direction * Math.sign(c[tangent] - b[tangent])
    if (middleLengthChange < 0) {
      maximumShift = Math.min(maximumShift, middleLength / -middleLengthChange)
    }
    const originalLength =
      Math.hypot(b.x - a.x, b.y - a.y) +
      middleLength +
      Math.hypot(d.x - c.x, d.y - c.y)
    let lower = 0
    let upper = maximumShift
    let bestCorners: [RoutePoint, RoutePoint] | undefined
    // Bisect toward the collision boundary on the current side of the detour.
    // Every accepted path is checked, so non-monotone free space can only
    // limit the improvement, never permit an unchecked shortcut.
    for (let attempt = 0; attempt < 25 && upper - lower > 1e-5; attempt++) {
      const shift = ((lower + upper) / 2) * direction
      const movedB = {
        ...b,
        [normal]: b[normal] + shift,
        [tangent]: b[tangent] + shift * firstSlope,
      }
      const movedC = {
        ...c,
        [normal]: c[normal] + shift,
        [tangent]: c[tangent] + shift * lastSlope,
      }
      const lengths = [
        Math.hypot(movedB.x - a.x, movedB.y - a.y),
        Math.hypot(movedC.x - movedB.x, movedC.y - movedB.y),
        Math.hypot(d.x - movedC.x, d.y - movedC.y),
      ]
      if (
        lengths.every((length) => length > 1e-9) &&
        lengths.reduce((sum, length) => sum + length, 0) <
          originalLength - 1e-9 &&
        this.isValidPath([a, movedB, movedC, d])
      ) {
        bestCorners = [movedB, movedC]
        lower = Math.abs(shift)
      } else {
        upper = Math.abs(shift)
      }
    }
    if (bestCorners) {
      this.newRoute[index + 1] = bestCorners[0]
      this.newRoute[index + 2] = bestCorners[1]
    }
  }
}
