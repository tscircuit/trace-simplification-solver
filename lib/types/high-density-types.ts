import type { CircuitJsonMetadata } from "./srj-types"

/**
 * A path for a wire in high-density intra-node routing.
 *
 * Wires travel along a route, and are placed to avoid other
 * wires at the same z-level. Any time a z level is changed,
 * you must place a via.
 *
 * z is an integer corresponding to the layer index
 *
 * z=0: top layer for 2 layer boards
 * z=1: bottom layer for 2 layer boards
 *
 * z must be an integer
 */
export type HighDensityIntraNodeRoute = {
  connectionName: string
  rootConnectionName?: string
  /** Terminal identities in route order, kept inert until terminal locking. */
  startPcbPortId?: string
  endPcbPortId?: string
  traceThickness: number
  viaDiameter: number
  route: Array<{
    x: number
    y: number
    z: number
    traceThickness?: number
    /** Keeps routed terminals fixed during post-route DRC optimization. */
    pcb_port_id?: string
    insideJumperPad?: boolean
    toNextSegmentType?: "through_obstacle"
    toNextSegmentCircuitJsonMetadata?: CircuitJsonMetadata
  }>
  vias: Array<{
    x: number
    y: number
    /** Overrides the route's default via diameter. */
    diameter?: number
    holeDiameter?: number
  }>
  jumpers?: Jumper[]
  regionId?: string
}

export type HighDensityRoute = HighDensityIntraNodeRoute

/**
 * A jumper component used to allow traces to cross on single-layer PCBs.
 * - "0603": Single 0603 jumper
 * - "1206": Single 1206 jumper
 * - "1206x4_pair": One of 4 internal jumper pairs in a 1206x4 resistor array
 */
export type Jumper = {
  route_type: "jumper"
  /** Starting point of the jumper */
  start: { x: number; y: number }
  /** Ending point of the jumper */
  end: { x: number; y: number }
  /** Footprint size */
  footprint: "0603" | "1206" | "1206x4_pair"
}
