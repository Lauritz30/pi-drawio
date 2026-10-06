// Native .drawio XML → IR. Uses fast-xml-parser for robust attribute/element
// handling and decodes draw.io's compressed <diagram> bodies (base64 of
// deflateRaw(encodeURIComponent(xml))) with Node's built-in zlib.

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { inflateRawSync } from "node:zlib";
import type { Diagram, Page, Cell, CellGeometry } from "./types.ts";

const RESERVED_ATTRS = new Set([
  "@_id", "@_value", "@_style", "@_vertex", "@_edge", "@_parent", "@_source", "@_target",
]);

function makeParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    isArray: (name) => name === "diagram" || name === "mxCell" || name === "mxPoint" || name === "Array",
  });
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toPoint(mp: unknown): { x: number; y: number } | null {
  if (!mp || typeof mp !== "object") return null;
  const o = mp as Record<string, unknown>;
  const x = num(o["@_x"]);
  const y = num(o["@_y"]);
  if (x === undefined || y === undefined) return null;
  return { x, y };
}

function parseGeometry(cellObj: Record<string, unknown>): CellGeometry | undefined {
  const g = cellObj.mxGeometry;
  if (!g || typeof g !== "object") return undefined;
  const go = g as Record<string, unknown>;
  const geo: CellGeometry = {};
  const x = num(go["@_x"]);
  const y = num(go["@_y"]);
  const w = num(go["@_width"]);
  const h = num(go["@_height"]);
  if (x !== undefined) geo.x = x;
  if (y !== undefined) geo.y = y;
  if (w !== undefined) geo.width = w;
  if (h !== undefined) geo.height = h;
  if (go["@_relative"] === "1" || go["@_relative"] === "true") geo.relative = true;

  const arr = go.Array as Record<string, unknown> | undefined;
  if (arr) {
    const mp = arr.mxPoint;
    const list = Array.isArray(mp) ? mp : mp ? [mp] : [];
    const pts = list.map(toPoint).filter((p): p is { x: number; y: number } => p !== null);
    if (pts.length) geo.points = pts;
  }
  return geo;
}

function cellFromObj(c: unknown): Cell {
  const o = (c ?? {}) as Record<string, unknown>;
  const id = String(o["@_id"] ?? `cell-${Math.random().toString(36).slice(2, 10)}`);

  const cell: Cell = { id };
  if (o["@_value"] !== undefined) cell.value = String(o["@_value"]);
  if (o["@_style"] !== undefined) cell.style = String(o["@_style"]);
  if (o["@_vertex"] === "1") cell.vertex = true;
  if (o["@_edge"] === "1") cell.edge = true;
  if (o["@_parent"] !== undefined) cell.parent = String(o["@_parent"]);
  if (o["@_source"] !== undefined) cell.source = String(o["@_source"]);
  if (o["@_target"] !== undefined) cell.target = String(o["@_target"]);

  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("@_") && !RESERVED_ATTRS.has(k) && typeof v === "string") {
      extra[k.slice(2)] = v;
    }
  }
  if (Object.keys(extra).length) cell.extraAttrs = extra;

  const geo = parseGeometry(o);
  if (geo) cell.geometry = geo;
  return cell;
}

/** Pull the mxGraphModel object out of either a bare <mxGraphModel> or a full <mxfile>. */
function getModelObject(obj: unknown): unknown {
  const o = (obj ?? {}) as Record<string, unknown>;
  if (o.mxGraphModel) return o.mxGraphModel;
  const diagrams = (o.mxfile as Record<string, unknown> | undefined)?.diagram;
  if (diagrams) {
    const list = Array.isArray(diagrams) ? diagrams : [diagrams];
    for (const d of list) {
      const m = (d as Record<string, unknown>)?.mxGraphModel;
      if (m) return m;
    }
  }
  return null;
}

function extractCells(modelObj: unknown): Cell[] {
  const model = getModelObject(modelObj) as { root?: { mxCell?: unknown } } | undefined;
  const mc = model?.root?.mxCell;
  if (!mc) return [];
  const list = Array.isArray(mc) ? mc : [mc];
  return list.map(cellFromObj);
}

function decodeBody(text: unknown): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (t.includes("<")) return t; // already raw XML
  try {
    const buf = Buffer.from(t, "base64");
    if (buf.length === 0) return t;
    const inf = inflateRawSync(buf);
    return decodeURIComponent(inf.toString("latin1"));
  } catch {
    return t;
  }
}

/** Returns true if valid, or an error string. */
export function validateXml(xml: string): true | string {
  const r = XMLValidator.validate(xml);
  if (r === true) return true;
  if (typeof r === "object" && r && "err" in r) {
    const e = (r as { err: unknown }).err;
    return typeof e === "string" ? e : JSON.stringify(e);
  }
  return "invalid XML";
}

export function parseDiagram(xml: string): Diagram {
  const parser = makeParser();
  let rootObj: unknown;
  try {
    rootObj = parser.parse(xml);
  } catch (e) {
    throw new Error(`Failed to parse .drawio XML: ${e instanceof Error ? e.message : String(e)}`);
  }

  const pages: Page[] = [];
  const root = rootObj as Record<string, unknown>;

  // Bare <mxGraphModel> (draw.io also accepts this).
  if (root.mxGraphModel) {
    pages.push({ id: "page-1", name: "Page-1", cells: extractCells(rootObj) });
    return { pages };
  }

  const mxfile = root.mxfile as Record<string, unknown> | undefined;
  if (!mxfile) throw new Error("Not a .drawio file: no <mxfile> or <mxGraphModel> found");

  const diagrams = Array.isArray(mxfile.diagram) ? mxfile.diagram : [mxfile.diagram];
  let i = 0;
  for (const d of diagrams) {
    i++;
    const do_ = (d ?? {}) as Record<string, unknown>;
    const id = String(do_["@_id"] ?? `page-${i}`);
    const name = String(do_["@_name"] ?? id);

    let modelObj: unknown = null;
    if (do_.mxGraphModel) {
      modelObj = { mxGraphModel: do_.mxGraphModel };
    } else if (do_["#text"] !== undefined) {
      const decoded = decodeBody(do_["#text"]);
      if (decoded.includes("<")) {
        try {
          modelObj = parser.parse(decoded);
        } catch {
          modelObj = null;
        }
      }
    }
    pages.push({ id, name, cells: modelObj ? extractCells(modelObj) : [] });
  }

  return { pages };
}
