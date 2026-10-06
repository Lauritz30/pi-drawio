// Named shape/edge styles → mxGraph style strings, plus color merging.

import type { RoleColor } from "./colors.ts";

export interface ShapeDef {
  style: string;
  width: number;
  height: number;
}

export const SHAPES: Record<string, ShapeDef> = {
  rounded:      { style: "rounded=1;whiteSpace=wrap;html=1;", width: 120, height: 60 },
  rectangle:    { style: "whiteSpace=wrap;html=1;", width: 120, height: 60 },
  ellipse:      { style: "ellipse;whiteSpace=wrap;html=1;", width: 120, height: 60 },
  terminator:   { style: "ellipse;whiteSpace=wrap;html=1;", width: 140, height: 50 },
  diamond:      { style: "rhombus;whiteSpace=wrap;html=1;", width: 140, height: 90 },
  parallelogram:{ style: "shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;", width: 130, height: 60 },
  hexagon:      { style: "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;", width: 130, height: 70 },
  document:     { style: "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;", width: 120, height: 80 },
  database:     { style: "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;", width: 90, height: 80 },
  cloud:        { style: "ellipse;shape=cloud;whiteSpace=wrap;html=1;", width: 140, height: 80 },
  text:         { style: "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;", width: 120, height: 30 },
  swimlane:     { style: "swimlane;html=1;horizontal=1;startSize=30;fontStyle=1;whiteSpace=wrap;", width: 220, height: 200 },
};

export const DEFAULT_SHAPE = "rounded";

export function resolveShape(name?: string): ShapeDef {
  return (name && SHAPES[name]) || SHAPES[DEFAULT_SHAPE];
}

/** True when the style marks a swimlane container. */
export function isSwimlane(style?: string): boolean {
  return !!style && /\bswimlane\b/.test(style);
}

/**
 * Append/override fillColor & strokeColor on a style string.
 * `header` also sets the swimlane header fill (swimlaneFillColor).
 */
export function withColor(style: string, color: RoleColor, opts?: { header?: boolean }): string {
  const s = style
    .replace(/fillColor=[^;]*;?/g, "")
    .replace(/strokeColor=[^;]*;?/g, "")
    .replace(/swimlaneFillColor=[^;]*;?/g, "")
    .replace(/;+$/, "");
  let out = `${s};fillColor=${color.fill};strokeColor=${color.stroke};`;
  if (opts?.header) out += `swimlaneFillColor=${color.header};`;
  return out;
}

export function swimlaneStyle(color: RoleColor): string {
  return withColor(SHAPES.swimlane.style, color, { header: true });
}

export function edgeStyle(kind: "arrow" | "line" | "dashed", color?: RoleColor): string {
  let s = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;";
  if (kind === "line") s += "endArrow=none;";
  else if (kind === "dashed") s += "dashed=1;endArrow=none;";
  else s += "endArrow=block;endFill=1;";
  if (color) s += `strokeColor=${color.stroke};`;
  return s;
}
