import { expect, test } from "bun:test"
import { segmentToBoxMinDistance } from "@tscircuit/math-utils"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { VertexShortcutPathSolver } from "lib/solvers/SimplifiedPathSolver/VertexShortcutPathSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"
import { minimumDistanceBetweenSegments } from "lib/utils/minimumDistanceBetweenSegments"

test("vertex shortcuts move both detour corners without cutting slots or other-net copper", (): void => {
  for (const reversed of [false, true]) {
    for (const width of [0.15, 0.5]) {
      for (const rotation of [0, 90, 180, 270]) {
        for (const withPeer of [false, true]) {
          // World-space mm, +X right, +Y up; rotate then translate asymmetrically.
          const transform = (
            x: number,
            y: number,
          ): { x: number; y: number; z: number } => {
            const point =
              rotation === 0
                ? { x, y }
                : rotation === 90
                  ? { x: -y, y: x }
                  : rotation === 180
                    ? { x: -x, y: -y }
                    : { x: y, y: -x }
            return { x: point.x + 1.3, y: point.y - 0.7, z: 0 }
          }
          const escape = width === 0.15 ? 0.3 : 0.55
          const inputRoute: HighDensityRoute = {
            connectionName: "signal",
            startPcbPortId: "start",
            endPcbPortId: "end",
            traceThickness: width,
            viaDiameter: 0.3,
            vias: [],
            route: [
              { ...transform(-7, 0), pcb_port_id: "start" },
              transform(-7, escape),
              transform(6.25 - escape - 7, 6.25),
              transform(7 - 6.25 + escape, 6.25),
              transform(7, escape),
              { ...transform(7, 0), pcb_port_id: "end" },
            ],
          }
          if (reversed) {
            inputRoute.route.reverse()
            inputRoute.startPcbPortId = "end"
            inputRoute.endPcbPortId = "start"
          }
          const obstacle = {
            type: "rect" as const,
            layers: ["top"],
            __zLayers: [0],
            center: { x: 1.3, y: -0.7 },
            width: rotation % 180 === 0 ? 5 : 9,
            height: rotation % 180 === 0 ? 9 : 5,
            connectedTo: [],
          }
          const peer: HighDensityRoute = {
            connectionName: "other-net",
            traceThickness: 0.4,
            viaDiameter: 0.3,
            vias: [],
            route: [transform(-0.5, 5), transform(0.5, 5)],
          }
          const before = structuredClone({ inputRoute, peer })
          const solver = new VertexShortcutPathSolver({
            inputRoute,
            otherHdRoutes: withPeer ? [peer] : [],
            obstacles: [obstacle],
            connMap: new ConnectivityMap({}),
            colorMap: {},
            useTraceWidthAwareClearance: true,
          })
          solver.solve()
          expect(solver.solved).toBe(true)
          const output = solver.simplifiedRoute
          expect(output.route[0]).toEqual(inputRoute.route[0])
          expect(output.route.at(-1)).toEqual(inputRoute.route.at(-1))
          expect(output.traceThickness).toBe(width)
          expect(output.startPcbPortId).toBe(reversed ? "end" : "start")
          expect(output.endPcbPortId).toBe(reversed ? "start" : "end")
          let length = 0
          for (let i = 1; i < output.route.length; i++) {
            const a = output.route[i - 1],
              b = output.route[i]
            length += Math.hypot(b.x - a.x, b.y - a.y)
            expect(a.z).toBe(0)
            expect(b.z).toBe(0)
            const dx = Math.abs(b.x - a.x),
              dy = Math.abs(b.y - a.y)
            expect(Math.min(dx, dy, Math.abs(dx - dy))).toBeLessThan(1e-7)
            expect(
              segmentToBoxMinDistance(a, b, obstacle) - width / 2,
            ).toBeGreaterThanOrEqual(0.1 - 1e-9)
            if (withPeer) {
              expect(
                minimumDistanceBetweenSegments(
                  a,
                  b,
                  peer.route[0],
                  peer.route[1],
                ) -
                  width / 2 -
                  0.2,
              ).toBeGreaterThanOrEqual(0.1 - 1e-9)
            }
          }
          // Independently constructed legal detours: 4.8/5 mm high without a
          // peer; 5.6 mm clears the 0.4 mm other-net trace at y=5 in both cases.
          const height = withPeer ? 5.6 : width === 0.15 ? 4.8 : 5
          const knownLegalLength =
            14 + 2 * escape + 2 * (Math.SQRT2 - 1) * (height - escape)
          expect(length).toBeLessThanOrEqual(knownLegalLength + 1e-6)
          expect({ inputRoute, peer }).toEqual(before)
        }
      }
    }
  }
})
