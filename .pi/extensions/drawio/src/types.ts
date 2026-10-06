// Core intermediate representation (IR) for draw.io diagrams.
// The extension reads/writes native .drawio (mxGraphModel) XML and works
// through this typed model in between.

export interface Point {
  x: number;
  y: number;
}

export interface CellGeometry {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Edge geometry is relative (drawn between terminals). */
  relative?: boolean;
  /** Edge waypoints. */
  points?: Point[];
  sourcePoint?: Point;
  targetPoint?: Point;
}

export interface Cell {
  id: string;
  /** Label text (draw.io `value` attribute). */
  value?: string;
  /** Full mxGraph style string. */
  style?: string;
  vertex?: boolean;
  edge?: boolean;
  parent?: string;
  source?: string;
  target?: string;
  geometry?: CellGeometry;
  /** Unknown attributes preserved across round-trips. */
  extraAttrs?: Record<string, string>;
}

export interface Page {
  id: string;
  name: string;
  cells: Cell[];
}

export interface Diagram {
  pages: Page[];
}

// ── Model-facing input specs (used by the tool schemas) ──────────────

export interface NodeSpec {
  id?: string;
  label?: string;
  shape?: string;
  /** Raw mxGraph style override (advanced). */
  style?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Lane id or name this node belongs to (for swimlanes). */
  lane?: string;
  /** Role key used to derive a stable fill color. */
  role?: string;
  fillColor?: string;
  strokeColor?: string;
}

export interface EdgeSpec {
  id?: string;
  source: string;
  target: string;
  label?: string;
  /** Raw mxGraph edge style override (advanced). */
  style?: string;
  dashed?: boolean;
  /** Show arrowhead (default true). */
  arrow?: boolean;
}

export interface LaneSpec {
  id?: string;
  /** Lane header title. */
  name?: string;
  /** Role key; determines the lane color. */
  role?: string;
  /** Hex fill color override for this lane. */
  color?: string;
  nodes?: NodeSpec[];
}

export type Direction = "vertical" | "horizontal";

export type ExportFormat = "png" | "svg" | "pdf";
