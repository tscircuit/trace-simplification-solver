import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../index"

type Fixture = Omit<
  ConstructorParameters<typeof SingleSimplifiedPathSolver5>[0],
  "connMap"
> & { connMap: Record<string, string[]> }

test("sample24 Net98 finishes with real geometric distance despite thousands of duplicate vertices", (): void => {
  const fixture = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "../fixtures/bug-reports/sample24-net98-geometric-distance.json.gz",
          import.meta.url,
        ),
      ),
    ).toString(),
  ) as Fixture
  expect(fixture.inputRoute.route).toHaveLength(6648)
  const solver = new SingleSimplifiedPathSolver5({
    ...fixture,
    connMap: new ConnectivityMap(fixture.connMap),
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.MAX_ITERATIONS).toBe(1000)
  expect(solver.iterations).toBeLessThan(1000)
  const result = solver.simplifiedRoute
  expect(result.route[0]).toEqual(fixture.inputRoute.route[0])
  expect(result.route.at(-1)).toEqual(fixture.inputRoute.route.at(-1))
  expect(result.vias).toEqual(fixture.inputRoute.vias)
  expect(
    result.route.every((point) =>
      [point.x, point.y, point.z].every(Number.isFinite),
    ),
  ).toBe(true)
  const inputTransitions = fixture.inputRoute.route
    .slice(1)
    .flatMap((point, index) =>
      fixture.inputRoute.route[index]!.z !== point.z
        ? [[fixture.inputRoute.route[index]!, point]]
        : [],
    )
  const outputTransitions = result.route
    .slice(1)
    .flatMap((point, index) =>
      result.route[index]!.z !== point.z ? [[result.route[index]!, point]] : [],
    )
  expect(inputTransitions).toHaveLength(19)
  expect(outputTransitions).toEqual(inputTransitions)
})
