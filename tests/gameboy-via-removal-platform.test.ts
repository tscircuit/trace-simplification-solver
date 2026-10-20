import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { getSvgFromGraphicsObject } from "graphics-debug"
import {
  HighDensityRouteSpatialIndex,
  ObstacleSpatialHashIndex,
  SingleRouteUselessViaRemovalSolver,
  type HighDensityRoute,
  type Obstacle,
} from "../index"
import fixture from "./fixtures/gameboy-via-removal-platform.json"

test("Game Boy via removal produces repeatable route geometry", async (): Promise<void> => {
  // Captured before source_trace_253 in the second via-removal pass.
  // The manual workflow compares actual, unrounded output across platforms.
  const outputs: HighDensityRoute[] = []
  for (let repeat = 0; repeat < 2; repeat++) {
    const input = structuredClone(fixture)
    const solver = new SingleRouteUselessViaRemovalSolver({
      ...input,
      obstacleSHI: new ObstacleSpatialHashIndex(
        "flatbush",
        input.obstacles as Obstacle[],
      ),
      hdRouteSHI: new HighDensityRouteSpatialIndex(input.indexedRoutes),
      connMap: new ConnectivityMap(input.connMap),
      terminalLayerIndicesByPcbPortId: new Map(
        (input.terminalLayerIndicesByPcbPortId as [string, number[]][]).map(
          ([portId, layers]) => [portId, new Set(layers)],
        ),
      ),
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    const output = solver.getOptimizedHdRoute()
    expect(output.route[0]).toEqual(input.unsimplifiedRoute.route[0])
    expect(output.route.at(-1)).toEqual(input.unsimplifiedRoute.route.at(-1))
    expect(output.vias.length).toBeLessThan(input.unsimplifiedRoute.vias.length)
    outputs.push(output)
    if (repeat === 0) {
      await expect(
        getSvgFromGraphicsObject(solver.visualize(), {
          backgroundColor: "white",
        }),
      ).toMatchSvgSnapshot(import.meta.path)
    }
  }
  expect(outputs[1]).toEqual(outputs[0])
  await Bun.write(
    new URL("../tmp/gameboy-via-removal-routes.json", import.meta.url),
    `${JSON.stringify(outputs[0], null, 2)}\n`,
  )
})
