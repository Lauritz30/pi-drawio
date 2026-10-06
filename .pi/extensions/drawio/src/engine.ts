// High-level operations shared by the tools: create, add, update, delete,
// list, read/write raw XML, export, open, and layout.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Diagram, Page, Cell, NodeSpec, EdgeSpec, LaneSpec, Direction, ExportFormat } from "./types.ts";
import { serializeDiagram } from "./serialize.ts";
import { parseDiagram, validateXml } from "./parse.ts";
import { applyLayeredLayout } from "./layout.ts";
import { resolveShape, withColor, swimlaneStyle, edgeStyle, isSwimlane } from "./styles.ts";
import { roleColor, colorByIndex, assignRoleColors, parseColor, DEFAULT_COLOR, type RoleColor } from "./colors.ts";
import { findDrawioSync, exportDiagram, applyLayout, openPath, openDiagramInEditor, drawioAvailable } from "./cli.ts";

export function resolvePath(cwd: string, p: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function genId(used: Set<string>, prefix: string): string {
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function emptyPage(): Page {
  return {
    id: "page-1",
    name: "Page-1",
    cells: [
      { id: "0" },
      { id: "1", parent: "0" },
    ],
  };
}

function loadDiagram(abs: string): Diagram {
  if (!existsSync(abs)) throw new Error(`Diagram not found: ${abs}`);
  return parseDiagram(readFileSync(abs, "utf8"));
}

function saveDiagram(abs: string, diagram: Diagram): void {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, serializeDiagram(diagram), "utf8");
}

interface Spec {
  nodes?: NodeSpec[];
  edges?: EdgeSpec[];
  lanes?: LaneSpec[];
}

function colorFromHex(hex?: string, fallback?: string): RoleColor | undefined {
  if (!hex) return undefined;
  const stroke = fallback ?? hex;
  return { name: "custom", fill: hex, stroke, header: hex };
}

interface BuildResult {
  lanes: Cell[];
  nodes: Cell[];
  edges: Cell[];
}

/**
 * Materialize lane/node/edge cells from a spec into a page, resolving lane
 * references (by id or name), assigning colors, and generating stable ids.
 */
function buildCells(spec: Spec, page: Page): BuildResult {
  const used = new Set(page.cells.map((c) => c.id));
  const result: BuildResult = { lanes: [], nodes: [], edges: [] };

  // Index existing lanes by id and by header name.
  const laneByKey = new Map<string, Cell>();
  const laneColor = new Map<string, RoleColor>();
  for (const c of page.cells) {
    if (c.vertex && isSwimlane(c.style)) {
      laneByKey.set(c.id, c);
      if (c.value) laneByKey.set(c.value, c);
      laneColor.set(c.id, parseColor(c.style) ?? DEFAULT_COLOR);
    }
  }

  // Stable, collision-free colors for every role-like key in this call.
  const roleKeys: string[] = [];
  for (const l of spec.lanes ?? []) {
    if (l.role) roleKeys.push(l.role);
    else if (l.name) roleKeys.push(l.name);
    for (const n of l.nodes ?? []) if (n.role) roleKeys.push(n.role);
  }
  for (const n of spec.nodes ?? []) if (n.role) roleKeys.push(n.role);
  const roleColorMap = assignRoleColors(roleKeys);
  let laneCounter = laneColor.size;

  // 1) Lanes.
  for (const ls of spec.lanes ?? []) {
    const existing = (ls.id && laneByKey.get(ls.id)) || (ls.name && laneByKey.get(ls.name));
    if (existing) continue;

    const id = ls.id && !used.has(ls.id) ? ls.id : genId(used, "lane");
    const roleKey = ls.role ?? ls.name ?? "";
    const color =
      colorFromHex(ls.color) ??
      roleColorMap.get(roleKey) ??
      (roleKey ? roleColor(roleKey) : colorByIndex(laneCounter++));
    const label = ls.name ?? ls.role ?? ls.id ?? id;

    const cell: Cell = { id, value: label, vertex: true, parent: "1", style: swimlaneStyle(color) };
    used.add(id);
    result.lanes.push(cell);
    page.cells.push(cell);
    laneByKey.set(id, cell);
    if (ls.name) laneByKey.set(ls.name, cell);
    laneColor.set(id, color);
  }

  // 2) Nodes (top-level + nested in lanes).
  const nodeSpecs: NodeSpec[] = [];
  for (const ls of spec.lanes ?? []) {
    for (const n of ls.nodes ?? []) {
      nodeSpecs.push({ ...n, lane: n.lane ?? ls.id ?? ls.name });
    }
  }
  for (const n of spec.nodes ?? []) nodeSpecs.push(n);

  for (const ns of nodeSpecs) {
    let laneId: string | null = null;
    if (ns.lane) {
      const existing = laneByKey.get(ns.lane);
      if (existing) {
        laneId = existing.id;
      } else {
        // Auto-create a lane for an unknown lane name.
        const id = genId(used, "lane");
        const roleKey = ns.role ?? ns.lane;
        const color = colorFromHex(ns.fillColor) ?? roleColorMap.get(roleKey) ?? roleColor(roleKey);
        const cell: Cell = {
          id,
          value: ns.lane,
          vertex: true,
          parent: "1",
          style: swimlaneStyle(color),
        };
        used.add(id);
        result.lanes.push(cell);
        page.cells.push(cell);
        laneByKey.set(ns.lane, cell);
        laneByKey.set(id, cell);
        laneColor.set(id, color);
        laneId = id;
      }
    }

    const shapeName = ns.shape ?? "rounded";
    const shape = resolveShape(shapeName);
    const w = ns.width ?? shape.width;
    const h = ns.height ?? shape.height;

    let color: RoleColor;
    if (shapeName === "text") {
      color = { name: "none", fill: "none", stroke: "none", header: "none" };
    } else {
      color =
        colorFromHex(ns.fillColor, ns.strokeColor) ??
        (laneId
          ? laneColor.get(laneId) ?? DEFAULT_COLOR
          : ns.role
            ? roleColorMap.get(ns.role) ?? roleColor(ns.role)
            : DEFAULT_COLOR);
    }

    const baseStyle = ns.style ?? shape.style;
    const style = shapeName === "text" ? baseStyle : withColor(baseStyle, color);

    const id = ns.id && !used.has(ns.id) ? ns.id : genId(used, "n");
    used.add(id);

    const cell: Cell = {
      id,
      value: ns.label ?? "",
      vertex: true,
      parent: laneId ?? "1",
      style,
      geometry: { x: ns.x ?? 0, y: ns.y ?? 0, width: w, height: h },
    };
    result.nodes.push(cell);
    page.cells.push(cell);
  }

  // 3) Edges.
  for (const es of spec.edges ?? []) {
    const kind = es.dashed ? "dashed" : es.arrow === false ? "line" : "arrow";
    const id = es.id && !used.has(es.id) ? es.id : genId(used, "e");
    used.add(id);
    const cell: Cell = {
      id,
      value: es.label,
      edge: true,
      parent: "1",
      source: es.source,
      target: es.target,
      style: es.style ?? edgeStyle(kind),
      geometry: { relative: true },
    };
    result.edges.push(cell);
    page.cells.push(cell);
  }

  return result;
}

export interface CreateOptions extends Spec {
  cwd: string;
  path: string;
  title?: string;
  direction?: Direction;
  /** "layered" (default) | "none" | "elk:<preset>" | "libavoid" */
  layout?: string;
  open?: boolean;
  exportFormat?: ExportFormat;
  border?: number;
  scale?: number;
}

export interface CreateResult {
  path: string;
  exported?: string;
  /** How the diagram was opened: desktop app or browser (undefined if open:false). */
  opened?: "desktop" | "browser";
  nodes: number;
  edges: number;
  lanes: number;
  drawioCli: boolean;
}

export async function createDiagram(opts: CreateOptions): Promise<CreateResult> {
  const abs = resolvePath(opts.cwd, opts.path);
  const page = emptyPage();
  if (opts.title) page.name = opts.title;

  const built = buildCells({ nodes: opts.nodes, edges: opts.edges, lanes: opts.lanes }, page);
  const layout = opts.layout ?? "layered";
  const direction: Direction = opts.direction ?? (built.lanes.length > 0 ? "horizontal" : "vertical");

  if (layout === "layered") {
    applyLayeredLayout(page, direction);
  }

  saveDiagram(abs, { pages: [page] });

  // CLI-only layout passes (ELK / libavoid) run against the file on disk.
  if (layout !== "none" && layout !== "layered") {
    const preset = layout.startsWith("elk:") ? layout.slice(4) : layout;
    if (!drawioAvailable()) {
      throw new Error(
        `Layout '${layout}' needs the draw.io desktop CLI (not installed). ` +
        `Use layout:"layered" (built-in) or layout:"none". The .drawio file was created at ${abs}.`,
      );
    }
    await applyLayout(abs, preset);
  }

  let exported: string | undefined;
  if (opts.exportFormat) {
    if (!drawioAvailable()) {
      throw new Error(
        `${opts.exportFormat.toUpperCase()} export needs the draw.io desktop app. ` +
        `The .drawio file was created at ${abs}; open it in draw.io or install the desktop app to export.`,
      );
    }
    exported = await exportDiagram(abs, opts.exportFormat, { border: opts.border, scale: opts.scale });
  }

  let opened: "desktop" | "browser" | undefined;
  if (opts.open !== false) {
    opened = openDiagramInEditor(abs);
    if (exported) openPath(exported);
  }

  return {
    path: abs,
    exported,
    opened,
    nodes: built.nodes.length,
    edges: built.edges.length,
    lanes: built.lanes.length,
    drawioCli: drawioAvailable(),
  };
}

export interface AddOptions extends Spec {
  cwd: string;
  path: string;
  direction?: Direction;
  layout?: string;
  open?: boolean;
}

export async function addCells(opts: AddOptions): Promise<{ path: string; nodes: number; edges: number; lanes: number; opened?: "desktop" | "browser" }> {
  const abs = resolvePath(opts.cwd, opts.path);
  if (!existsSync(abs)) {
    throw new Error(`No diagram at ${abs}. Use drawio_create_diagram first.`);
  }
  const diagram = loadDiagram(abs);
  const page = diagram.pages[0] ?? emptyPage();
  const built = buildCells({ nodes: opts.nodes, edges: opts.edges, lanes: opts.lanes }, page);

  const layout = opts.layout ?? "layered";
  if (layout === "layered") {
    applyLayeredLayout(page, opts.direction ?? (built.lanes.length > 0 ? "horizontal" : "vertical"));
  }
  saveDiagram(abs, diagram);

  if (layout !== "none" && layout !== "layered") {
    const preset = layout.startsWith("elk:") ? layout.slice(4) : layout;
    if (!drawioAvailable()) throw new Error(`Layout '${layout}' needs the draw.io desktop CLI (not installed).`);
    await applyLayout(abs, preset);
  }

  let opened: "desktop" | "browser" | undefined;
  if (opts.open !== false) opened = openDiagramInEditor(abs);

  return { path: abs, nodes: built.nodes.length, edges: built.edges.length, lanes: built.lanes.length, opened };
}

export interface UpdateCellSpec {
  id: string;
  label?: string;
  style?: string;
  shape?: string;
  fillColor?: string;
  strokeColor?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export async function updateCells(opts: { cwd: string; path: string; cells: UpdateCellSpec[]; layout?: string }): Promise<{ path: string; updated: number }> {
  const abs = resolvePath(opts.cwd, opts.path);
  const diagram = loadDiagram(abs);
  const page = diagram.pages[0] ?? emptyPage();

  let updated = 0;
  for (const spec of opts.cells) {
    const cell = page.cells.find((c) => c.id === spec.id);
    if (!cell) throw new Error(`Cell '${spec.id}' not found in ${abs}`);

    if (spec.label !== undefined) cell.value = spec.label;
    if (spec.style !== undefined) cell.style = spec.style;

    if (spec.shape && !cell.edge) {
      const shape = resolveShape(spec.shape);
      const color = parseColor(cell.style) ?? DEFAULT_COLOR;
      cell.style = spec.shape === "text" ? shape.style : withColor(shape.style, color);
      if (spec.width === undefined && cell.geometry && !cell.geometry.width) cell.geometry.width = shape.width;
      if (spec.height === undefined && cell.geometry && !cell.geometry.height) cell.geometry.height = shape.height;
    }

    if ((spec.fillColor || spec.strokeColor) && cell.style) {
      const cur = parseColor(cell.style) ?? DEFAULT_COLOR;
      cell.style = withColor(cell.style, {
        name: "custom",
        fill: spec.fillColor ?? cur.fill,
        stroke: spec.strokeColor ?? cur.stroke,
        header: cur.header,
      });
    }

    if (!cell.geometry) cell.geometry = {};
    if (spec.x !== undefined) cell.geometry.x = spec.x;
    if (spec.y !== undefined) cell.geometry.y = spec.y;
    if (spec.width !== undefined) cell.geometry.width = spec.width;
    if (spec.height !== undefined) cell.geometry.height = spec.height;

    updated++;
  }

  if (opts.layout !== "none") applyLayeredLayout(page, "vertical");
  saveDiagram(abs, diagram);
  return { path: abs, updated };
}

export async function deleteCells(opts: { cwd: string; path: string; ids: string[]; layout?: string }): Promise<{ path: string; removed: number }> {
  const abs = resolvePath(opts.cwd, opts.path);
  const diagram = loadDiagram(abs);
  const page = diagram.pages[0] ?? emptyPage();

  const toRemove = new Set(opts.ids);
  // Remove edges whose endpoint is removed.
  for (const c of page.cells) {
    if (c.edge && ((c.source && toRemove.has(c.source)) || (c.target && toRemove.has(c.target)))) {
      toRemove.add(c.id);
    }
  }
  const before = page.cells.length;
  page.cells = page.cells.filter((c) => !toRemove.has(c.id));

  if (opts.layout !== "none") applyLayeredLayout(page, "vertical");
  saveDiagram(abs, diagram);
  return { path: abs, removed: before - page.cells.length };
}

export interface CellSummary {
  id: string;
  kind: "root" | "layer" | "swimlane" | "node" | "edge";
  label?: string;
  parent?: string;
  source?: string;
  target?: string;
  geometry?: { x?: number; y?: number; width?: number; height?: number };
  style?: string;
}

export function listCells(opts: { cwd: string; path: string }): { path: string; cells: CellSummary[] } {
  const abs = resolvePath(opts.cwd, opts.path);
  const diagram = loadDiagram(abs);
  const page = diagram.pages[0];
  const cells: CellSummary[] = (page?.cells ?? []).map((c) => {
    let kind: CellSummary["kind"];
    if (c.edge) kind = "edge";
    else if (c.id === "0") kind = "root";
    else if (c.id === "1") kind = "layer";
    else if (isSwimlane(c.style)) kind = "swimlane";
    else kind = "node";
    const g = c.geometry;
    return {
      id: c.id,
      kind,
      label: c.value,
      parent: c.parent,
      source: c.source,
      target: c.target,
      geometry: g ? { x: g.x, y: g.y, width: g.width, height: g.height } : undefined,
      style: c.style,
    };
  });
  return { path: abs, cells };
}

export function readXml(opts: { cwd: string; path: string }): { path: string; xml: string } {
  const abs = resolvePath(opts.cwd, opts.path);
  if (!existsSync(abs)) throw new Error(`Diagram not found: ${abs}`);
  return { path: abs, xml: readFileSync(abs, "utf8") };
}

export function writeXml(opts: { cwd: string; path: string; xml: string }): { path: string } {
  const abs = resolvePath(opts.cwd, opts.path);
  const check = validateXml(opts.xml);
  if (check !== true) throw new Error(`XML is not well-formed: ${check}`);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, opts.xml, "utf8");
  return { path: abs };
}

export async function exportDiagramOp(opts: {
  cwd: string;
  path: string;
  format: ExportFormat;
  border?: number;
  scale?: number;
  transparent?: boolean;
  layout?: string;
}): Promise<{ path: string; output: string }> {
  const abs = resolvePath(opts.cwd, opts.path);
  if (!existsSync(abs)) throw new Error(`Diagram not found: ${abs}`);
  if (!drawioAvailable()) throw new Error("Export needs the draw.io desktop app (not installed).");
  const output = await exportDiagram(abs, opts.format, {
    border: opts.border,
    scale: opts.scale,
    transparent: opts.transparent,
    layout: opts.layout,
  });
  return { path: abs, output };
}

export function openDiagram(opts: { cwd: string; path: string }): { path: string; opened: "desktop" | "browser" } {
  const abs = resolvePath(opts.cwd, opts.path);
  if (!existsSync(abs)) throw new Error(`Diagram not found: ${abs}`);
  const opened = openDiagramInEditor(abs);
  return { path: abs, opened };
}

export async function layoutDiagram(opts: { cwd: string; path: string; layout: string }): Promise<{ path: string; layout: string }> {
  const abs = resolvePath(opts.cwd, opts.path);
  if (!existsSync(abs)) throw new Error(`Diagram not found: ${abs}`);
  if (opts.layout === "layered") {
    const diagram = loadDiagram(abs);
    applyLayeredLayout(diagram.pages[0] ?? emptyPage(), "vertical");
    saveDiagram(abs, diagram);
  } else {
    const preset = opts.layout.startsWith("elk:") ? opts.layout.slice(4) : opts.layout;
    if (!drawioAvailable()) throw new Error(`Layout '${opts.layout}' needs the draw.io desktop CLI (not installed).`);
    await applyLayout(abs, preset);
  }
  return { path: abs, layout: opts.layout };
}

export function cliAvailable(): boolean {
  return drawioAvailable();
}

export function detectedCliPath(): string | null {
  return findDrawioSync();
}
