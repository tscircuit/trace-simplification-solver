export type TraceId = string
export type NetId = string
export type OffBoardConnectionId = string

export type CircuitJsonMetadata = {
  pcb_smtpad_id?: string
  pcb_plated_hole_id?: string
  pcb_port_id?: string
  pcb_via_id?: string
  source_component_name?: string
  source_port_name?: string
}

export interface Obstacle {
  obstacleId?: string
  /** Optional source component identifier associated with this obstacle. */
  componentId?: string
  /** True when this obstacle replaces one completed fanout source footprint. */
  isFanoutSourceKeepout?: boolean
  shape?: "circle"
  isNonPlatedHole?: boolean
  /**
   * Optional Circuit JSON provenance carried through SRJ.
   * Routing algorithms must not use this field.
   */
  circuitJsonMetadata?: CircuitJsonMetadata
  type: "rect"
  layers: string[]
  /** Public z-layer indexes supplied by SimpleRouteJson producers. */
  zLayers?: number[]
  /** Canonicalized z-layer indexes used by autorouter internals. */
  __zLayers?: number[]
  center: { x: number; y: number }
  width: number
  height: number
  /** Optional counter-clockwise rotation metadata in degrees. */
  ccwRotationDegrees?: number
  connectedTo: Array<TraceId | NetId>
  isCopperPour?: boolean
  netIsAssignable?: boolean
  offBoardConnectsTo?: Array<OffBoardConnectionId>
}
