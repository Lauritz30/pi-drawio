// pi-drawio extension entry point.
// Registers draw.io tools and a /drawio command. Works entirely locally:
// it builds/edits native .drawio (mxGraphModel) XML and optionally uses the
// draw.io desktop CLI for ELK layout and PNG/SVG/PDF export. No MCP needed.

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createDiagram,
  addCells,
  updateCells,
  deleteCells,
  listCells,
  readXml,
  writeXml,
  exportDiagramOp,
  openDiagram,
  layoutDiagram,
  cliAvailable,
  detectedCliPath,
} from "./src/engine.ts";
import { SHAPES } from "./src/styles.ts";
import { PALETTE } from "./src/colors.ts";

const Direction = Type.Optional(
  Type.Union([Type.Literal("vertical"), Type.Literal("horizontal")], {
    description: "Flow direction for the built-in layered layout.",
  }),
);

const Format = Type.Optional(
  Type.Union([Type.Literal("png"), Type.Literal("svg"), Type.Literal("pdf")], {
    description: "Export format. XML is embedded so the export stays editable in draw.io.",
  }),
);

const LayoutField = Type.Optional(
  Type.String({
    description:
      'Layout to apply. "layered" (default, built-in, no CLI) | "none" (use explicit x/y) | ' +
      '"elk:verticalFlow" | "elk:horizontalFlow" | "elk:verticalTree" | "elk:horizontalTree" | ' +
      '"elk:organic" | "libavoid" (needs draw.io desktop CLI).',
  }),
);

const NodeSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "Stable node id (e.g. 'start', 'approve'). Must be unique; referenced by edges." })),
  label: Type.Optional(Type.String({ description: "Node text label." })),
  shape: Type.Optional(
    Type.String({
      description:
        "Shape name: rounded, rectangle, ellipse, terminator, diamond, parallelogram, hexagon, document, database, cloud, text.",
    }),
  ),
  style: Type.Optional(Type.String({ description: "Raw mxGraph style string override (advanced)." })),
  lane: Type.Optional(Type.String({ description: "Lane id or name this node belongs to (for swimlanes)." })),
  role: Type.Optional(Type.String({ description: "Role key (e.g. 'customer', 'backend') used to derive a stable color." })),
  fillColor: Type.Optional(Type.String({ description: "Hex fill override, e.g. '#DAE8FC'." })),
  strokeColor: Type.Optional(Type.String({ description: "Hex border override, e.g. '#6C8EBF'." })),
  x: Type.Optional(Type.Number({ description: "Explicit x (only used when layout is 'none')." })),
  y: Type.Optional(Type.Number({ description: "Explicit y (only used when layout is 'none')." })),
  width: Type.Optional(Type.Number({ description: "Width in px." })),
  height: Type.Optional(Type.Number({ description: "Height in px." })),
});

const EdgeSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "Optional edge id." })),
  source: Type.String({ description: "Source node id." }),
  target: Type.String({ description: "Target node id." }),
  label: Type.Optional(Type.String({ description: "Edge label." })),
  style: Type.Optional(Type.String({ description: "Raw mxGraph edge style override (advanced)." })),
  dashed: Type.Optional(Type.Boolean({ description: "Dashed connector without arrowhead." })),
  arrow: Type.Optional(Type.Boolean({ description: "Show arrowhead (default true)." })),
});

const LaneSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "Optional lane id (referenced by node.lane)." })),
  name: Type.Optional(Type.String({ description: "Lane header title." })),
  role: Type.Optional(Type.String({ description: "Role key; determines the lane color (one role = one color)." })),
  color: Type.Optional(Type.String({ description: "Hex fill override for this lane." })),
  nodes: Type.Optional(Type.Array(NodeSchema, { description: "Nodes to place inside this lane." })),
});

const NodeArray = Type.Array(NodeSchema);
const EdgeArray = Type.Array(EdgeSchema);
const LaneArray = Type.Array(LaneSchema);

function textResult(text: string, details: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], details };
}

const createTool = defineTool({
  name: "drawio_create_diagram",
  label: "Create draw.io diagram",
  description:
    "Create a new .drawio diagram (flowchart, process flow, architecture, etc.) and write it to a local file. " +
    "Use lanes[] to make swimlanes (one lane per role/actor). Assign each node a `lane` (id or name) and optionally a `role`. " +
    "Roles and lanes are auto-colored: one role = one color, each lane gets a distinct color. " +
    "Nodes reference edges via their id (give nodes stable ids). " +
    "After creation the file is opened in the draw.io desktop app (or in the browser if the app is not installed); " +
    "if `exportFormat` is set, a PNG/SVG/PDF is also produced and you SHOULD read it back (via the read tool) to visually verify the layout.",
  parameters: Type.Object({
    path: Type.String({ description: "Output file path, e.g. 'diagrams/login-flow.drawio'." }),
    title: Type.Optional(Type.String({ description: "Diagram/page title." })),
    nodes: Type.Optional(NodeArray),
    edges: Type.Optional(EdgeArray),
    lanes: Type.Optional(LaneArray),
    direction: Direction,
    layout: LayoutField,
    open: Type.Optional(Type.Boolean({ description: "Open in draw.io desktop after (default true)." })),
    exportFormat: Format,
    border: Type.Optional(Type.Number({ description: "Export border width in px (default 10)." })),
    scale: Type.Optional(Type.Number({ description: "Export scale, e.g. 2 for 2x resolution PNG." })),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = await createDiagram({
      cwd: ctx.cwd,
      path: params.path,
      title: params.title,
      nodes: params.nodes,
      edges: params.edges,
      lanes: params.lanes,
      direction: params.direction,
      layout: params.layout,
      open: params.open,
      exportFormat: params.exportFormat,
      border: params.border,
      scale: params.scale,
    });
    const lines = [
      `Created ${r.nodes} node(s), ${r.edges} edge(s), ${r.lanes} lane(s).`,
      `File: ${r.path}`,
    ];
    if (r.opened) lines.push(`Opened in ${r.opened === "desktop" ? "the draw.io desktop app" : "the browser (draw.io web editor)"}.`);
    if (r.exported) lines.push(`Exported: ${r.exported} — read it back to verify the layout.`);
    if (!r.drawioCli) lines.push("draw.io desktop CLI not detected; PNG/SVG/PDF export and ELK layout are unavailable.");
    return textResult(lines.join("\n"), r);
  },
});

const addTool = defineTool({
  name: "drawio_add_cells",
  label: "Add cells to diagram",
  description:
    "Add nodes, edges, and/or lanes to an existing .drawio diagram, then re-run the built-in layered layout. " +
    "Reference existing nodes by id in edges. New lanes can be created via lanes[] or referenced by name in node.lane.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the .drawio file." }),
    nodes: Type.Optional(NodeArray),
    edges: Type.Optional(EdgeArray),
    lanes: Type.Optional(LaneArray),
    direction: Direction,
    layout: LayoutField,
    open: Type.Optional(Type.Boolean({ description: "Open in draw.io after (default true)." })),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = await addCells({
      cwd: ctx.cwd,
      path: params.path,
      nodes: params.nodes,
      edges: params.edges,
      lanes: params.lanes,
      direction: params.direction,
      layout: params.layout,
      open: params.open,
    });
    const where = r.opened ? ` Opened in ${r.opened === "desktop" ? "the draw.io desktop app" : "the browser (draw.io web editor)"}.` : "";
    return textResult(`Added ${r.nodes} node(s), ${r.edges} edge(s), ${r.lanes} lane(s). File: ${r.path}.${where}`, r);
  },
});

const updateTool = defineTool({
  name: "drawio_update_cells",
  label: "Update cells",
  description: "Update labels, styles, colors, shapes, or positions of existing cells by id.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the .drawio file." }),
    cells: Type.Array(
      Type.Object({
        id: Type.String({ description: "Cell id to update." }),
        label: Type.Optional(Type.String()),
        style: Type.Optional(Type.String({ description: "Raw mxGraph style override." })),
        shape: Type.Optional(Type.String({ description: "Change shape (rounded, rectangle, ellipse, diamond, ...)." })),
        fillColor: Type.Optional(Type.String()),
        strokeColor: Type.Optional(Type.String()),
        x: Type.Optional(Type.Number()),
        y: Type.Optional(Type.Number()),
        width: Type.Optional(Type.Number()),
        height: Type.Optional(Type.Number()),
      }),
    ),
    layout: Type.Optional(Type.String({ description: "Re-run layout after update (default: layered; pass 'none' to keep positions)." })),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = await updateCells({ cwd: ctx.cwd, path: params.path, cells: params.cells, layout: params.layout });
    return textResult(`Updated ${r.updated} cell(s). File: ${r.path}`, r);
  },
});

const deleteTool = defineTool({
  name: "drawio_delete_cells",
  label: "Delete cells",
  description: "Delete cells by id. Edges connected to a deleted node are removed too.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the .drawio file." }),
    ids: Type.Array(Type.String({ description: "Cell ids to delete." })),
    layout: Type.Optional(Type.String({ description: "Re-run layout after delete (default: layered; pass 'none' to skip)." })),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = await deleteCells({ cwd: ctx.cwd, path: params.path, ids: params.ids, layout: params.layout });
    return textResult(`Removed ${r.removed} cell(s). File: ${r.path}`, r);
  },
});

const listTool = defineTool({
  name: "drawio_list_cells",
  label: "List diagram cells",
  description: "List all cells (id, kind, label, parent, geometry, style) in a .drawio diagram so you know what exists before editing.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the .drawio file." }),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = listCells({ cwd: ctx.cwd, path: params.path });
    const lines = r.cells.map((c) => {
      const g = c.geometry
        ? ` (${c.geometry.x ?? "?"},${c.geometry.y ?? "?"} ${c.geometry.width ?? "?"}x${c.geometry.height ?? "?"})`
        : "";
      const extra = c.kind === "edge" ? ` ${c.source}->${c.target}` : c.kind === "swimlane" ? " [swimlane]" : "";
      return `${c.id} [${c.kind}]${extra} label="${c.label ?? ""}" parent="${c.parent ?? ""}"${g}`;
    });
    return textResult(lines.join("\n") || "(no cells)", r);
  },
});

const readXmlTool = defineTool({
  name: "drawio_read_xml",
  label: "Read raw diagram XML",
  description: "Return the raw .drawio XML (escape hatch for advanced edits).",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the .drawio file." }),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = readXml({ cwd: ctx.cwd, path: params.path });
    return textResult(r.xml, r);
  },
});

const writeXmlTool = defineTool({
  name: "drawio_write_xml",
  label: "Write raw diagram XML",
  description: "Overwrite a .drawio file with raw mxGraphModel XML (escape hatch). Validates well-formedness first.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the .drawio file." }),
    xml: Type.String({ description: "Full mxfile/mxGraphModel XML." }),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = writeXml({ cwd: ctx.cwd, path: params.path, xml: params.xml });
    return textResult(`Wrote raw XML to ${r.path}`, r);
  },
});

const exportTool = defineTool({
  name: "drawio_export",
  label: "Export diagram",
  description:
    "Export a .drawio diagram to PNG/SVG/PDF via the draw.io desktop CLI (XML embedded, so it stays editable). " +
    "After exporting, read the PNG/SVG back to visually verify the diagram.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the .drawio file." }),
    format: Type.Union([Type.Literal("png"), Type.Literal("svg"), Type.Literal("pdf")], { description: "Output format." }),
    border: Type.Optional(Type.Number({ description: "Border width in px (default 10)." })),
    scale: Type.Optional(Type.Number({ description: "Scale, e.g. 2 for 2x." })),
    transparent: Type.Optional(Type.Boolean({ description: "Transparent background (PNG only)." })),
    layout: Type.Optional(Type.String({ description: "Optional ELK preset or libavoid to apply before export." })),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = await exportDiagramOp({
      cwd: ctx.cwd,
      path: params.path,
      format: params.format,
      border: params.border,
      scale: params.scale,
      transparent: params.transparent,
      layout: params.layout,
    });
    return textResult(`Exported ${r.path} → ${r.output}. Read it back to verify.`, r);
  },
});

const openTool = defineTool({
  name: "drawio_open",
  label: "Open diagram in draw.io",
  description: "Open a .drawio file in the draw.io desktop app, falling back to the browser (draw.io web editor) if the desktop app is not installed.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the file to open." }),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = openDiagram({ cwd: ctx.cwd, path: params.path });
    return textResult(`Opened ${r.path} in ${r.opened === "desktop" ? "the draw.io desktop app" : "the browser (draw.io web editor)"}.`, r);
  },
});

const layoutTool = defineTool({
  name: "drawio_layout",
  label: "Apply layout",
  description: "Re-layout a diagram: built-in 'layered', or an ELK preset / 'libavoid' via the draw.io desktop CLI.",
  parameters: Type.Object({
    path: Type.String({ description: "Path to the .drawio file." }),
    layout: Type.String({ description: "'layered' (built-in) | 'elk:verticalFlow' | 'elk:horizontalFlow' | 'elk:organic' | 'libavoid' ..." }),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
    const r = await layoutDiagram({ cwd: ctx.cwd, path: params.path, layout: params.layout });
    return textResult(`Applied layout '${r.layout}' to ${r.path}`, r);
  },
});

const statusTool = defineTool({
  name: "drawio_status",
  label: "Draw.io environment status",
  description: "Report whether the draw.io desktop CLI is available and list the shape names and color palette this extension supports.",
  parameters: Type.Object({}),
  async execute(_id, _params, _signal, _onUpdate, _ctx) {
    const shapes = Object.keys(SHAPES).join(", ");
    const colors = PALETTE.map((c) => `${c.name} (${c.fill})`).join(", ");
    const cli = cliAvailable();
    const r = {
      cliAvailable: cli,
      cliPath: detectedCliPath(),
      shapes,
      palette: PALETTE.map((c) => ({ name: c.name, fill: c.fill, stroke: c.stroke })),
    };
    return textResult(
      `draw.io desktop CLI: ${cli ? `available (${detectedCliPath()})` : "NOT available — PNG/SVG/PDF export and ELK layout disabled."}\n` +
        `Shapes: ${shapes}\n` +
        `Role colors: ${colors}`,
      r,
    );
  },
});

export default function drawioExtension(pi: ExtensionAPI) {
  pi.registerTool(createTool);
  pi.registerTool(addTool);
  pi.registerTool(updateTool);
  pi.registerTool(deleteTool);
  pi.registerTool(listTool);
  pi.registerTool(readXmlTool);
  pi.registerTool(writeXmlTool);
  pi.registerTool(exportTool);
  pi.registerTool(openTool);
  pi.registerTool(layoutTool);
  pi.registerTool(statusTool);

  pi.registerCommand("drawio", {
    description: "draw.io helpers: /drawio open <file> | export <file> [format] | list <file> | status",
    handler: async (args, ctx) => {
      const [sub, ...rest] = (args ?? "").trim().split(/\s+/).filter(Boolean);
      const file = rest[0];
      try {
        if (!sub) {
          ctx.ui.notify("Usage: /drawio open <file> | export <file> [format] | list <file> | status", "info");
          return;
        }
        if (sub === "status") {
          ctx.ui.notify(`draw.io CLI: ${cliAvailable() ? "available" : "not available"}`, "info");
          return;
        }
        if (!file) {
          ctx.ui.notify("Missing file path.", "error");
          return;
        }
        if (sub === "open") {
          const r = openDiagram({ cwd: ctx.cwd, path: file });
          ctx.ui.notify(`Opened ${file} in ${r.opened === "desktop" ? "draw.io desktop" : "the browser"}`, "info");
        } else if (sub === "export") {
          const format = (rest[1] as "png" | "svg" | "pdf") ?? "png";
          const r = await exportDiagramOp({ cwd: ctx.cwd, path: file, format });
          ctx.ui.notify(`Exported → ${r.output}`, "info");
        } else if (sub === "list") {
          const r = listCells({ cwd: ctx.cwd, path: file });
          ctx.ui.notify(`${r.cells.length} cells in ${file}`, "info");
        } else {
          ctx.ui.notify(`Unknown /drawio subcommand: ${sub}`, "error");
        }
      } catch (e) {
        ctx.ui.notify(`drawio: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });
}
