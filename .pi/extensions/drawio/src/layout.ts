// Built-in layered auto-layout (no CLI needed). Assigns a topological layer
// (longest path from sources) to every node, then positions them either
// top-to-bottom or left-to-right. Swimlane-aware: when lanes exist, nodes are
// laid out left-to-right inside their lane, lanes stack vertically.

import type { Page, Cell } from "./types.ts";
import { isSwimlane } from "./styles.ts";

interface NodeInfo {
  cell: Cell;
  w: number;
  h: number;
  laneId: string | null;
}

const MARGIN = 40;
const COL_GAP = 40;
const ROW_GAP = 40;
const PAD = 20;
const HEADER = 30;
const LANE_GAP = 20;

export function applyLayeredLayout(page: Page, direction: "vertical" | "horizontal" = "vertical"): void {
  const cells = page.cells;
  const laneCells = cells.filter((c) => c.vertex && isSwimlane(c.style));
  const laneIds = new Set(laneCells.map((c) => c.id));

  const nodes: NodeInfo[] = [];
  for (const c of cells) {
    if (!c.vertex || c.edge) continue;
    if (c.id === "0" || c.id === "1") continue;
    if (isSwimlane(c.style)) continue;
    const g = c.geometry ?? {};
    const w = g.width && g.width > 0 ? g.width : 120;
    const h = g.height && g.height > 0 ? g.height : 60;
    let laneId: string | null = c.parent && laneIds.has(c.parent) ? c.parent : null;
    // Ungrouped node in a swimlane diagram → first lane.
    if (laneCells.length > 0 && laneId === null) laneId = laneCells[0].id;
    nodes.push({ cell: c, w, h, laneId });
  }

  const edges = cells.filter((c) => c.edge && c.source && c.target);
  const layers = computeLayers(
    nodes.map((n) => n.cell.id),
    edges.map((e) => ({ source: e.source as string, target: e.target as string })),
  );

  const maxW = Math.max(60, ...nodes.map((n) => n.w));
  const maxH = Math.max(40, ...nodes.map((n) => n.h));
  const maxLayer = Math.max(0, ...Array.from(layers.values()));

  if (laneCells.length > 0) {
    const rows = laneCells.map((lc) => {
      const inLane = nodes.filter((n) => n.laneId === lc.id);
      return { cell: lc, nodes: inLane, contentH: Math.max(60, ...inLane.map((n) => n.h)) };
    });

    const contentW = (maxLayer + 1) * maxW + maxLayer * COL_GAP;
    const laneW = contentW + 2 * PAD;
    let y = MARGIN;

    for (const row of rows) {
      const laneH = HEADER + row.contentH + 2 * PAD;
      row.cell.geometry = { x: MARGIN, y, width: laneW, height: laneH };
      for (const n of row.nodes) {
        const layer = layers.get(n.cell.id) ?? 0;
        const xRel = PAD + layer * (maxW + COL_GAP) + (maxW - n.w) / 2;
        const yRel = HEADER + PAD + (row.contentH - n.h) / 2;
        n.cell.parent = row.cell.id;
        n.cell.geometry = { x: xRel, y: yRel, width: n.w, height: n.h };
      }
      y += laneH + LANE_GAP;
    }
  } else {
    const groups = new Map<number, NodeInfo[]>();
    for (const n of nodes) {
      const l = layers.get(n.cell.id) ?? 0;
      if (!groups.has(l)) groups.set(l, []);
      groups.get(l)!.push(n);
    }
    const maxCount = Math.max(1, ...Array.from(groups.values()).map((g) => g.length));
    const totalW = maxCount * maxW + (maxCount - 1) * COL_GAP;
    const totalH = (maxLayer + 1) * maxH + maxLayer * ROW_GAP;

    for (const [layerStr, group] of groups.entries()) {
      const layer = Number(layerStr);
      group.forEach((n, idx) => {
        if (direction === "horizontal") {
          const x = MARGIN + layer * (maxW + COL_GAP);
          const groupH = group.length * maxH + (group.length - 1) * ROW_GAP;
          const y = MARGIN + (totalH - groupH) / 2 + idx * (maxH + ROW_GAP);
          n.cell.geometry = { x, y, width: n.w, height: n.h };
        } else {
          const y = MARGIN + layer * (maxH + ROW_GAP);
          const groupW = group.length * maxW + (group.length - 1) * COL_GAP;
          const x = MARGIN + (totalW - groupW) / 2 + idx * (maxW + COL_GAP);
          n.cell.geometry = { x, y, width: n.w, height: n.h };
        }
      });
    }
  }

  for (const e of edges) {
    e.geometry = { relative: true };
  }
}

function computeLayers(
  nodeIds: string[],
  edges: { source: string; target: string }[],
): Map<string, number> {
  const succ = new Map<string, string[]>();
  const pred = new Map<string, string[]>();
  for (const id of nodeIds) {
    succ.set(id, []);
    pred.set(id, []);
  }
  const ids = new Set(nodeIds);
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) {
      succ.get(e.source)!.push(e.target);
      pred.get(e.target)!.push(e.source);
    }
  }

  const indeg = new Map<string, number>();
  const layer = new Map<string, number>();
  for (const id of nodeIds) {
    indeg.set(id, pred.get(id)!.length);
    layer.set(id, 0);
  }

  const queue: string[] = [];
  for (const id of nodeIds) if (indeg.get(id) === 0) queue.push(id);
  const visited = new Set<string>();

  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const s of succ.get(cur)!) {
      layer.set(s, Math.max(layer.get(s)!, layer.get(cur)! + 1));
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }

  // Cycle leftovers get appended layers so they don't overlap.
  let maxLayer = 0;
  for (const l of layer.values()) maxLayer = Math.max(maxLayer, l);
  for (const id of nodeIds) {
    if (!visited.has(id)) layer.set(id, ++maxLayer);
  }
  return layer;
}
