import { pointToSegmentDistance } from "@tscircuit/math-utils"
import {
  SameNetViaMergerSolver,
  type SameNetViaMergerSolverInput,
} from "lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"
import { minimumDistanceBetweenSegments } from "lib/utils/minimumDistanceBetweenSegments"
import type { ViaMergePanel } from "./getViaMergeComparisonSvg"
import {
  createViaMergeBranchInput,
  createViaMergeClearanceInput,
  createViaMergePadContactInput,
} from "./via-merge-clearance-routes"

export type ViaMergeReviewCase = {
  name: string
  heading: string
  explanation: string
  input: SameNetViaMergerSolverInput
  panels: ViaMergePanel[]
  detailCenter: { x: number; y: number }
  layer: number
  measurements: [number, number, number]
}

export const createViaMergeReviewCase = (
  name: "wire" | "branch" | "pad",
): ViaMergeReviewCase => {
  const input =
    name === "wire"
      ? createViaMergeClearanceInput()
      : name === "branch"
        ? createViaMergeBranchInput()
        : createViaMergePadContactInput()
  const unchecked = new SameNetViaMergerSolver({
    ...input,
    clearanceConstraints: undefined,
  })
  const checked = new SameNetViaMergerSolver(input)
  unchecked.solve()
  checked.solve()
  const routes = [
    input.inputHdRoutes,
    unchecked.getMergedViaHdRoutes()!,
    checked.getMergedViaHdRoutes()!,
  ]
  const measure = (routes: HighDensityRoute[]): number => {
    const moving = routes.find((route) => route.connectionName === "diagonal")!
    if (name === "wire") {
      const neighbor = routes.find(
        (route) => route.connectionName === "neighbor",
      )!
      return (
        minimumDistanceBetweenSegments(
          moving.route[0]!,
          moving.route[1]!,
          neighbor.route[0]!,
          neighbor.route[1]!,
        ) - 0.1
      )
    }
    const contact =
      name === "branch"
        ? input.otherHdRoutes![1]!.route[0]!
        : input.obstacles[0]!.center
    // This fixture's branch wire and pad both have radius 0.05 mm.
    return (
      pointToSegmentDistance(contact, moving.vias[0]!, moving.vias[0]!) -
      moving.viaDiameter / 2 -
      0.05
    )
  }
  const measurements = routes.map(measure) as [number, number, number]
  const headings =
    name === "wire"
      ? [
          "BEFORE: two occupied sites",
          "UNCHECKED: bends into copper",
          "CHECKED: choose the other site",
        ]
      : [
          "BEFORE: barrel carries a contact",
          "UNCHECKED: breaks the contact",
          "CHECKED: retain the barrel",
        ]
  const panels = routes.map(
    (routes, i): ViaMergePanel => ({
      title: headings[i]!,
      routes,
      details:
        name === "wire"
          ? [
              `Wire-to-wire gap: ${measurements[i]!.toFixed(3)} mm`,
              "Required edge clearance: 0.100 mm",
              i === 1
                ? "Via motion is short; the attached wire is unsafe."
                : i === 2
                  ? "Reverse merge direction keeps the wire clear."
                  : "Green: power. Red: foreign wire. Blue: vias.",
            ]
          : [
              `${name === "pad" ? "Barrel-to-pad" : "Barrel-to-branch"} gap: ${measurements[i]!.toFixed(3)} mm`,
              "A positive gap means the physical contact is lost.",
              name === "pad"
                ? "Inner layer: the barrel is the only connection."
                : "Red branch shares the green trace's electrical net.",
            ],
    }),
  )
  return {
    name,
    input,
    panels,
    measurements,
    detailCenter:
      name === "wire" ? { x: 0.53, y: 0.69 } : { x: -0.12, y: 0.14 },
    layer: name === "pad" ? 1 : 0,
    heading:
      name === "wire"
        ? "1. Check the attached wire, not the via's travel path"
        : name === "branch"
          ? "2. Same net does not guarantee a surviving physical contact"
          : "3. A via barrel may be a pad's only contact on an inner layer",
    explanation:
      name === "wire"
        ? "Measure the final copper edges before accepting the candidate. The other occupied target is safe."
        : "Keep this merge rejected. Reducing the via count must not disconnect existing copper.",
  }
}
