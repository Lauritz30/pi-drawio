// IR → native .drawio (mxGraphModel) XML.

import type { Diagram, Cell } from "./types.ts";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#xa;")
    .replace(/\r/g, "&#xd;")
    .replace(/\t/g, "&#x9;");
}

function fmt(n: number): string {
  const v = Math.round(n * 100) / 100;
  return String(v === 0 ? 0 : v);
}

const RESERVED_ATTRS = new Set(["id", "value", "style", "vertex", "edge", "parent", "source", "target"]);

function cellToXml(cell: Cell): string {
  const a: string[] = [`id="${esc(cell.id)}"`];
  if (cell.value !== undefined) a.push(`value="${esc(cell.value)}"`);
  if (cell.style) a.push(`style="${esc(cell.style)}"`);
  if (cell.vertex) a.push(`vertex="1"`);
  if (cell.edge) a.push(`edge="1"`);
  if (cell.parent !== undefined) a.push(`parent="${esc(cell.parent)}"`);
  if (cell.source !== undefined) a.push(`source="${esc(cell.source)}"`);
  if (cell.target !== undefined) a.push(`target="${esc(cell.target)}"`);
  if (cell.extraAttrs) {
    for (const [k, v] of Object.entries(cell.extraAttrs)) {
      if (!RESERVED_ATTRS.has(k)) a.push(`${esc(k)}="${esc(v)}"`);
    }
  }

  let inner = "";
  const geo = cell.geometry;

  if (cell.edge) {
    const pts = geo?.points?.map((p) => `<mxPoint x="${fmt(p.x)}" y="${fmt(p.y)}" />`).join("") ?? "";
    inner = pts
      ? `<mxGeometry relative="1" as="geometry"><Array as="points">${pts}</Array></mxGeometry>`
      : `<mxGeometry relative="1" as="geometry" />`;
  } else if (geo) {
    const g: string[] = [];
    if (geo.x !== undefined) g.push(`x="${fmt(geo.x)}"`);
    if (geo.y !== undefined) g.push(`y="${fmt(geo.y)}"`);
    if (geo.width !== undefined) g.push(`width="${fmt(geo.width)}"`);
    if (geo.height !== undefined) g.push(`height="${fmt(geo.height)}"`);
    if (geo.relative) g.push(`relative="1"`);
    g.push(`as="geometry"`);
    inner = `<mxGeometry ${g.join(" ")} />`;
  }

  return inner ? `<mxCell ${a.join(" ")}>${inner}</mxCell>` : `<mxCell ${a.join(" ")} />`;
}

export function serializeDiagram(diagram: Diagram): string {
  const diagrams = diagram.pages
    .map((page) => {
      const cells = page.cells.map(cellToXml).join("\n");
      const model =
        `<mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">\n` +
        `  <root>\n${cells}\n  </root>\n</mxGraphModel>`;
      return `<diagram id="${esc(page.id)}" name="${esc(page.name)}">\n${model}\n</diagram>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="pi-drawio" agent="pi" version="24.0.0">\n${diagrams}\n</mxfile>\n`;
}
