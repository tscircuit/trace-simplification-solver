# Trace Simplification Solver

Incremental PCB trace simplification for [tscircuit](https://github.com/tscircuit/tscircuit). Takes existing high-density routes and optimizes their vias and paths while accounting for obstacles, connectivity, and other routed copper.

![Before and after simplifying a trace around immutable routed copper](tests/features/__snapshots__/trace-simplification-immutable-routes-immutable-routed-peer.snap.svg)

## How it works

`TraceSimplificationSolver` runs two passes through this pipeline by default:

1. **Via removal** — remove unnecessary layer transitions.
2. **Crossing via reduction** — coordinate layer swaps at crossings to remove via pairs (opt-in).
3. **Same-net via merging** — merge redundant vias belonging to the same net.
4. **Path simplification** — simplify route geometry, with optional vertex shortcuts.

The solver can run to completion with `solve()` or advance incrementally with `step()`.

## Installation

```sh
bun add @tscircuit/trace-simplification-solver circuit-json-to-connectivity-map
```

The package exports TypeScript source. Use Bun or a toolchain that supports TypeScript dependencies.

## Usage

```ts
import {
  TraceSimplificationSolver,
  type HighDensityRoute,
} from "@tscircuit/trace-simplification-solver"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"

const hdRoutes: HighDensityRoute[] = [
  {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    route: [
      { x: -2, y: 0, z: 0 },
      { x: -1, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    vias: [],
  },
]

const solver = new TraceSimplificationSolver({
  hdRoutes,
  obstacles: [],
  connMap: new ConnectivityMap({}),
  colorMap: { signal: "orange" },
  defaultViaDiameter: 0.3,
  layerCount: 2,
})

solver.solve()
if (solver.failed) {
  throw new Error(solver.error ?? "Trace simplification failed")
}

const simplifiedRoutes = solver.simplifiedHdRoutes
console.log(simplifiedRoutes)
```

Route points use integer `z` layer indices: `0` is the top layer, and `layerCount - 1` is the bottom layer. Represent a via with consecutive route points at the same `x`/`y` on different layers and an entry in `vias`. Keep coordinates, trace widths, via diameters, and clearances in consistent units (millimeters for tscircuit boards).

For connected routes and pads, populate `connMap` with their shared identities, for example `connMap.addConnections([["signal", "signal_branch", "pad_id"]])`. The empty map above is sufficient for the isolated route in the example.

## Configuration

The exported `TraceSimplificationSolverOptions` type describes the constructor options.

| Required option | Description |
| --- | --- |
| `hdRoutes` | High-density routes to simplify. |
| `obstacles` | Board obstacles, including their layers and connectivity. |
| `connMap` | `ConnectivityMap` used to identify electrically connected objects. |
| `colorMap` | Map of connection names to visualization colors; may be empty. |
| `defaultViaDiameter` | Default via diameter for path simplification. |
| `layerCount` | Number of routing layers. |

| Optional option | Description |
| --- | --- |
| `otherHdRoutes` | Immutable routed copper to avoid. These routes are neither modified nor included in the output. |
| `outline` | Board boundary as an array of `{ x, y }` points. |
| `minTraceToPadEdgeClearance` | Obstacle margin for via-removal shortcuts and crossing reduction; defaults to `0.15`. |
| `minBoardEdgeClearance` | Trace-edge clearance to the outline during path simplification; defaults to `0.2`. |
| `enableCrossingViaReduction` | Enable crossing layer swaps and local obstacle-detour shortcuts on later via-removal passes; off by default. |
| `preserveRouteEndpoints` | Preserve each route's start/end coordinates and layers; off by default. Requires nonempty routes with unique connection names. |
| `netByConnectionName` | `ReadonlyMap<string, string>` providing explicit net identities for via merging, useful for synthetic connection names. |
| `useTraceWidthAwareClearance` | Use actual segment widths for path-simplification clearance checks; off by default. |
| `enableVertexShortcuts` | Run vertex cleanup after path sampling; off by default. |
| `iterations` | Positive integer number of complete pipeline passes; defaults to `2`. |
| `terminalLayerIndicesByPcbPortId` | Map PCB-port IDs to sets of physical layer indices on which the terminal can accept an endpoint without a via. |

To run another cleanup pass after path simplification opens space for via removal, pass `iterations: 3` to the constructor. This is separate from the step limit, `solver.MAX_ITERATIONS`.

## Incremental solving and visualization

Instead of calling `solve()`, call `step()` until the solver finishes:

```ts
while (!solver.solved && !solver.failed) {
  solver.step()
  // Render solver.visualize() here to inspect the current phase.
}

if (solver.failed) {
  throw new Error(solver.error ?? "Trace simplification failed")
}
```

`solver.visualize()` returns a `GraphicsObject` compatible with `graphics-debug`, both during solving and after completion. The [tests](tests) include SVG rendering and snapshot examples.

## Individual solvers

The package also exports `UselessViaRemovalSolver`, `SameNetViaMergerSolver`, `CrossingViaReductionSolver`, and `MultiSimplifiedPathSolver` for running individual phases. Their constructor options and result accessors differ; see their implementations in [lib/solvers](lib/solvers) and the complete exports in [index.ts](index.ts).

## Development

CI uses Bun `1.3.8`.

```sh
git clone https://github.com/tscircuit/trace-simplification-solver.git
cd trace-simplification-solver
bun install
bun run test
bun run typecheck
bun run format:check
```

Tests cover via removal, merging, crossing reduction, clearance checks, endpoint preservation, immutable routes, and SVG snapshots.

## License

[MIT](LICENSE)
