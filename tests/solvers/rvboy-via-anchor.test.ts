import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../index"
import { getRvboyViaAnchorView } from "../fixtures/rvboy-via-anchor/getRvboyViaAnchorView"
import source from "../fixtures/rvboy-via-anchor/source.json"

test("preserves the entering-layer via anchor in the exact RVboy path", async (): Promise<void> => {
  const raw = gunzipSync(
    readFileSync(
      new URL("../fixtures/rvboy-via-anchor/input.json.gz", import.meta.url),
    ),
  )
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    source.inputSha256,
  )
  const captured = JSON.parse(raw.toString())
  const solver = new SingleSimplifiedPathSolver5({
    ...captured,
    connMap: new ConnectivityMap(captured.connMap.netMap),
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const result = solver.simplifiedRoute
  expect(result.route[0]).toEqual(captured.inputRoute.route[0])
  expect(result.route.at(-1)).toEqual(captured.inputRoute.route.at(-1))
  for (let i = 1; i < result.route.length; i++) {
    const before = result.route[i - 1]!
    const after = result.route[i]!
    if (before.z === after.z || before.toNextSegmentType === "through_obstacle")
      continue
    expect({ x: before.x, y: before.y }).toEqual({ x: after.x, y: after.y })
  }
  const anchor = { x: -18.445, y: 3.089 }
  expect(result.vias).toContainEqual(anchor)
  expect(result.route).toContainEqual({ ...anchor, z: 0 })
  expect(result.route).toContainEqual({ ...anchor, z: 3 })
  await expect(getRvboyViaAnchorView(captured, result)).toMatchSvgSnapshot(
    import.meta.path,
  )
})
