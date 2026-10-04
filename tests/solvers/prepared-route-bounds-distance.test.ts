import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import { createPreparedBoundsDistance } from "lib/utils/createPreparedBoundsDistance"
import {
  frozenSegmentToBoundsMinDistance,
  type FrozenBounds,
  type FrozenPoint,
} from "../fixtures/frozen-segment-to-bounds-distance"

interface DistanceCase {
  start: FrozenPoint
  end: FrozenPoint
  bounds: FrozenBounds
}

function adjacentFloat(value: number, direction: "up" | "down"): number {
  if (!Number.isFinite(value)) return value
  if (value === 0) {
    return direction === "up" ? Number.MIN_VALUE : -Number.MIN_VALUE
  }
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  view.setFloat64(0, value)
  let bits = view.getBigUint64(0)
  bits += (value > 0) === (direction === "up") ? 1n : -1n
  view.setBigUint64(0, bits)
  return view.getFloat64(0)
}

test("prepared bounds retain exact distance and cutoff behavior", () => {
  const bounds: FrozenBounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  const cases: DistanceCase[] = [
    { start: { x: 0, y: 0 }, end: { x: 0.5, y: 0.5 }, bounds },
    { start: { x: -2, y: 0 }, end: { x: 2, y: 0 }, bounds },
    { start: { x: -2, y: -1 }, end: { x: 2, y: -1 }, bounds },
    { start: { x: -2, y: -2 }, end: { x: -1, y: -1 }, bounds },
    { start: { x: -2, y: -2 }, end: { x: 2, y: 2 }, bounds },
    { start: { x: -3, y: 4 }, end: { x: -2, y: 3 }, bounds },
    { start: { x: 2, y: 0 }, end: { x: 2, y: 0 }, bounds },
    { start: { x: -0, y: 0 }, end: { x: 0, y: -0 }, bounds },
  ]
  const values: number[] = [
    -Infinity,
    -Number.MAX_VALUE,
    -1e155,
    -1e154,
    -(2 ** -512),
    -(2 ** -540),
    -Number.MIN_VALUE,
    -0,
    0,
    Number.MIN_VALUE,
    2 ** -540,
    2 ** -512,
    adjacentFloat(-1, "down"),
    adjacentFloat(-1, "up"),
    adjacentFloat(1, "down"),
    adjacentFloat(1, "up"),
    1e154,
    1e155,
    Number.MAX_VALUE,
    Infinity,
    NaN,
  ]
  const edgeBounds: FrozenBounds[] = [
    bounds,
    { minX: -0, maxX: 0, minY: -0, maxY: 0 },
    { minX: 0, maxX: 0, minY: -1, maxY: 1 },
    { minX: -1, maxX: 1, minY: 0, maxY: 0 },
    { minX: 1, maxX: -1, minY: 1, maxY: -1 },
    {
      minX: -Infinity,
      maxX: Infinity,
      minY: -Infinity,
      maxY: Infinity,
    },
    {
      minX: Number.MIN_VALUE,
      maxX: 2 ** -540,
      minY: 0,
      maxY: 2 ** -540,
    },
    { minX: 1e154, maxX: 1e155, minY: -1e155, maxY: -1e154 },
  ]
  for (const value of values) {
    for (const rectangle of edgeBounds) {
      cases.push(
        {
          start: { x: value, y: 2 },
          end: { x: 3, y: -2 },
          bounds: rectangle,
        },
        {
          start: { x: -2, y: value },
          end: { x: 3, y: -2 },
          bounds: rectangle,
        },
        {
          start: { x: -2, y: 2 },
          end: { x: value, y: -2 },
          bounds: rectangle,
        },
        {
          start: { x: -2, y: 2 },
          end: { x: 3, y: value },
          bounds: rectangle,
        },
        {
          start: { x: value, y: value },
          end: { x: value, y: value },
          bounds: rectangle,
        },
      )
    }
    for (const key of ["minX", "maxX", "minY", "maxY"] as const) {
      cases.push({
        start: { x: -2, y: 2 },
        end: { x: 3, y: -2 },
        bounds: { ...bounds, [key]: value },
      })
    }
  }
  let state = 1934238
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  for (let index = 0; index < 600; index++) {
    const scale = 2 ** (Math.floor(random() * 2100) - 1070)
    const coordinates = Array.from(
      { length: 8 },
      () => (random() * 8 - 4) * scale,
    )
    cases.push({
      start: { x: coordinates[0], y: coordinates[1] },
      end: { x: coordinates[2], y: coordinates[3] },
      bounds: {
        minX: Math.min(coordinates[4], coordinates[5]),
        maxX: Math.max(coordinates[4], coordinates[5]),
        minY: Math.min(coordinates[6], coordinates[7]),
        maxY: Math.max(coordinates[6], coordinates[7]),
      },
    })
  }
  for (const { start, end, bounds: rectangle } of cases) {
    const prepared = createPreparedBoundsDistance(rectangle)
    for (const [first, second] of [
      [start, end],
      [end, start],
    ]) {
      const expected = frozenSegmentToBoundsMinDistance(
        first,
        second,
        rectangle,
      )
      const actual = prepared(first, second)
      expect(
        Object.is(
          segmentToBoundsMinDistance(first, second, rectangle),
          expected,
        ),
      ).toBe(true)
      expect(Object.is(actual, expected)).toBe(true)
      for (const cutoff of [
        0,
        0.25,
        expected,
        adjacentFloat(expected, "up"),
        adjacentFloat(expected, "down"),
      ]) {
        expect(actual <= cutoff).toBe(expected <= cutoff)
      }
    }
  }
})
