---
name: drawio-diagrams
description: Create, edit, and color draw.io diagrams locally with the pi-drawio extension. Use when asked to draw, create, generate, or design a diagram, flowchart, process flow, architecture diagram, network diagram, ER/sequence/class diagram, or swimlane diagram, or to color roles and swimlanes so it is clear who does what.
---

# Drawing diagrams with pi-drawio

This project ships a `pi-drawio` extension that creates and edits native
`.drawio` files **locally — no MCP server**. Use its tools (they start with
`drawio_`) to build diagrams. This skill covers *how* to use them well,
especially the coloring rules for roles and swimlanes.

## When to use which tool

| Goal | Tool |
|---|---|
| Create a diagram from scratch | `drawio_create_diagram` |
| Add nodes/edges/lanes to an existing diagram | `drawio_add_cells` |
| Change a label, color, shape, or position | `drawio_update_cells` |
| Remove cells | `drawio_delete_cells` |
| See what is in a diagram | `drawio_list_cells` |
| Export PNG/SVG/PDF | `drawio_export` |
| Open in the draw.io desktop app | `drawio_open` |
| Re-run auto-layout | `drawio_layout` |
| Check CLI availability + palette | `drawio_status` |

## The core loop (do this every time)

1. **Create** with `drawio_create_diagram`, giving every node a stable `id`
   and connecting them with `edges` (referencing those ids).
2. **Export** a PNG (`exportFormat: "png"`) so you can *see* the result.
3. **Read the PNG back** with the `read` tool and fix overlaps, mislabels, or
   wrong shapes. (Only helps if the current model accepts images.)
4. **Open** the `.drawio` for the user.

## Coloring rules (roles and swimlanes)

The extension colors automatically, so follow these rules and let it do the work:

- **One role = one color.** Give each lane a `role` (e.g. `"customer"`,
  `"backend"`, `"finance"`). The same role string always maps to the same
  color, deterministically, so `"backend"` stays consistent across diagrams.
- **Each swimlane gets a distinct color.** Lanes without a `role` still get a
  distinct color from the palette (assigned in lane order).
- **Nodes inherit their lane's color.** A node placed in a lane is tinted with
  that lane's fill, so "who does this" is visible at a glance.
- **Different roles must be named differently.** `"backend"` and
  `"Backend-service"` are different roles and get different colors — be
  consistent with role strings.
- **To force a specific color**, pass `fillColor` (and optionally
  `strokeColor`) on the lane or node, e.g. `fillColor: "#DAE8FC"`. Use this
  sparingly; prefer the automatic role mapping for consistency.

### Palette

The automatic role colors come from this palette (fill / stroke):

| name | fill | stroke |
|---|---|---|
| blue | `#DBEAFE` | `#3B82F6` |
| green | `#D1FAE5` | `#10B981` |
| red | `#FEE2E2` | `#EF4444` |
| amber | `#FEF3C7` | `#F59E0B` |
| purple | `#EDE9FE` | `#8B5CF6` |
| pink | `#FCE7F3` | `#EC4899` |
| cyan | `#CFFAFE` | `#06B6D4` |
| teal | `#CCFBF1` | `#14B8A6` |
| indigo | `#E0E7FF` | `#6366F1` |
| orange | `#FFEDD5` | `#F97316` |
| lime | `#ECFCCB` | `#84CC16` |
| slate | `#F1F5F9` | `#64748B` |

## Drawing process flows with swimlanes

Process flows ("who does what, in which order") are the primary use case:

1. One **lane per role/actor**, using `lanes: [{ id, name, role, ... }]`.
2. Assign every step to a lane with `lane: "<lane id or name>"` on the node.
3. Use meaningful shapes:
   - `terminator` for start/end
   - `rounded` for a process step
   - `diamond` for a decision (label it as a yes/no question, put `yes`/`no`
     on the outgoing edges)
   - `document` for inputs/outputs, `database` for data stores
4. Give nodes stable ids (`start`, `approve`, `ship`) and reference them in
   `edges`. The built-in `layered` layout orders nodes left-to-right by flow.
5. Keep labels short — long labels overflow fixed-size shapes.

Example:

```json
{
  "path": "diagrams/order-process.drawio",
  "title": "Order process",
  "lanes": [
    { "id": "customer", "name": "Customer", "role": "customer",
      "nodes": [
        { "id": "start", "label": "Place order", "shape": "terminator" },
        { "id": "receive", "label": "Receive goods", "shape": "rounded" }
      ] },
    { "id": "backend", "name": "Backend", "role": "backend",
      "nodes": [
        { "id": "validate", "label": "Validate order", "shape": "rounded" },
        { "id": "ship", "label": "Ship order", "shape": "rounded" }
      ] }
  ],
  "edges": [
    { "source": "start", "target": "validate" },
    { "source": "validate", "target": "ship" },
    { "source": "ship", "target": "receive" }
  ],
  "exportFormat": "png"
}
```

## Architecture diagrams

No lanes, free-form boxes:

- Give each component a `shape` (`rounded`, `database`, `cloud`, `document`,
  `ellipse`, `hexagon`, `parallelogram`, …).
- The built-in `layered` layout stacks components by dependency order
  (top-to-bottom). For a force-directed network use `layout: "elk:organic"`
  (needs the draw.io desktop CLI).
- Optionally tint a component by role with `role` or `fillColor`/`strokeColor`.

## Layout options

- `"layered"` (default) — built-in, no CLI, swimlane-aware. Flowcharts/process
  flows and simple layered diagrams.
- `"elk:verticalFlow"` / `"elk:horizontalFlow"` / `"elk:organic"` / `"libavoid"`
  — higher quality, via the draw.io desktop CLI (installed here). Use when the
  built-in layout looks rough.
- `"none"` — use the explicit `x`/`y` you provide.

## Notes and limits

- Files are native `.drawio` (mxGraphModel XML); they open directly in draw.io.
- PNG/SVG/PDF export and ELK layout require the draw.io **desktop** app
  (`drawio` CLI). Without it you can still create/edit/open `.drawio` files.
- Multi-page diagrams and custom shape libraries (AWS/Azure icons) are not yet
  supported; single page only for now.
- Match the diagram's label language to the user's language.
