export { TraceSimplificationSolver } from "./lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
export { MultiSimplifiedPathSolver } from "./lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"
export { UselessViaRemovalSolver } from "./lib/solvers/UselessViaRemovalSolver/UselessViaRemovalSolver"
export { SameNetViaMergerSolver } from "./lib/solvers/SameNetViaMergerSolver/SameNetViaMergerSolver"
export { CrossingViaReductionSolver } from "./lib/solvers/CrossingViaReductionSolver/crossing-via-reduction-solver"
export type {
  HighDensityRoute,
  HighDensityIntraNodeRoute,
} from "./lib/types/high-density-types"
export type { Obstacle } from "./lib/types"
import type { TraceSimplificationSolver } from "./lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
export type TraceSimplificationSolverOptions = ConstructorParameters<
  typeof TraceSimplificationSolver
>[0]
export { SingleSimplifiedPathSolver } from "./lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver"
export { SingleSimplifiedPathSolver5 } from "./lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
export { VertexShortcutPathSolver } from "./lib/solvers/SimplifiedPathSolver/VertexShortcutPathSolver"
export { SingleRouteUselessViaRemovalSolver } from "./lib/solvers/UselessViaRemovalSolver/SingleRouteUselessViaRemovalSolver"
export { ObstacleSpatialHashIndex } from "./lib/data-structures/ObstacleTree"
export { HighDensityRouteSpatialIndex } from "./lib/data-structures/HighDensityRouteSpatialIndex"
export { calculate45DegreePaths } from "./lib/utils/calculate45DegreePaths"

export { getTraceSimplificationObstacles } from "./lib/utils/getTraceSimplificationObstacles"
