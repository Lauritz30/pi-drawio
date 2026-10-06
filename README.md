# pi-drawio

A local [draw.io](https://www.drawio.com) extension for the
[Pi coding agent](https://github.com/earendil-works/pi). It lets Pi create and
edit native `.drawio` diagrams **without an MCP server** — it builds the
mxGraphModel XML directly and optionally uses the draw.io desktop CLI for
auto-layout and PNG/SVG/PDF export.

## What it does

- **Creates/edits `.drawio` files** (flowcharts, process flows with swimlanes,
  architecture diagrams) from structured JSON specs.
- **Built-in layered auto-layout** (no CLI needed), swimlane-aware for
  left-to-right process flows. Optional ELK/`libavoid` layout via the desktop CLI.
- **Role/lane coloring**: one role = one color, each swimlane gets a distinct
  color, and nodes inherit their lane's color — so "who does what" is visible.
- **PNG/SVG/PDF export** via the draw.io desktop CLI (XML embedded, so exports
  stay editable), plus a read-back loop: export → `read` the image → fix issues.
- **Open** diagrams in the draw.io desktop app.

## Layout

```
pi-drawio/
├── .pi/
│   ├── extensions/drawio/        # the extension (auto-loads in this repo)
│   │   ├── index.ts              # registers tools + /drawio command
│   │   ├── package.json          # dep: fast-xml-parser
│   │   └── src/
│   │       ├── types.ts          # IR (Cell/Page/Diagram + specs)
│   │       ├── colors.ts         # role/lane color palette + assignment
│   │       ├── styles.ts         # named shape/edge → mxGraph style strings
│   │       ├── serialize.ts      # IR → .drawio XML
│   │       ├── parse.ts          # .drawio XML → IR (compressed diagrams too)
│   │       ├── layout.ts         # built-in layered layout
│   │       ├── cli.ts            # drawio desktop CLI detection/export/layout/open
│   │       └── engine.ts         # high-level ops shared by tools
│   └── skills/drawio-diagrams/   # skill: how to color roles & swimlanes
│       └── SKILL.md
├── test/smoke.ts                 # end-to-end smoke test
└── package.json
```

## Install

The extension already lives in `.pi/extensions/drawio/`, so it loads
automatically when Pi runs inside this repo (after project trust). The skill in
`.pi/skills/drawio-diagrams/` is discovered the same way.

### Use it in any project (global)

Symlink the extension and skill into your agent directory:

```bash
mkdir -p ~/.pi/agent/extensions ~/.pi/agent/skills
ln -s "$(pwd)/.pi/extensions/drawio" ~/.pi/agent/extensions/drawio
ln -s "$(pwd)/.pi/skills/drawio-diagrams" ~/.pi/agent/skills/drawio-diagrams
```

Restart Pi (or run `/reload`).

### Dependencies

```bash
cd .pi/extensions/drawio && npm install
```

Only runtime dependency is [`fast-xml-parser`](https://www.npmjs.com/package/fast-xml-parser).
The draw.io **desktop app** ([diagrams.net](https://www.diagrams.net)) is
optional but enables PNG/SVG/PDF export and ELK/`libavoid` layout. On macOS it
is auto-detected at `/Applications/draw.io.app/Contents/MacOS/draw.io`; set
`DRAWIO_PATH` to override.

## Tools

| Tool | Purpose |
|---|---|
| `drawio_create_diagram` | Create a `.drawio` from nodes/edges/lanes |
| `drawio_add_cells` | Add nodes/edges/lanes to an existing diagram |
| `drawio_update_cells` | Change label/style/color/shape/position by id |
| `drawio_delete_cells` | Remove cells (and their connected edges) |
| `drawio_list_cells` | List cells (id, kind, label, parent, geometry, style) |
| `drawio_read_xml` / `drawio_write_xml` | Raw XML escape hatch |
| `drawio_export` | PNG/SVG/PDF via desktop CLI |
| `drawio_open` | Open a file in the draw.io desktop app |
| `drawio_layout` | Re-run layout (`layered`, `elk:*`, `libavoid`) |
| `drawio_status` | CLI availability + shape/color palette |

Plus a `/drawio` command: `/drawio open <file>`, `/drawio export <file> [format]`,
`/drawio list <file>`, `/drawio status`.

## Example

"Draw a login process flow with Customer and Backend swimlanes and export it as PNG":

```
drawio_create_diagram
  path: diagrams/login-flow.drawio
  title: Login flow
  lanes: [
    { id: customer, name: Customer, role: customer, nodes: [ { id: start, label: Enter credentials, shape: rounded } ] },
    { id: backend,  name: Backend,  role: backend,  nodes: [ { id: check, label: Validate, shape: diamond } ] }
  ]
  edges: [ { source: start, target: check } ]
  exportFormat: png
```

Then read the PNG back to verify.

## Coloring conventions

- One **role** = one color (deterministic; the same role string keeps the same
  color across diagrams).
- Each **swimlane** gets a distinct color; nodes inside inherit the lane color.
- Role strings must be consistent (`"backend"` ≠ `"Backend"`).
- Override with `fillColor` / `strokeColor` (hex) on a lane or node when needed.

See `.pi/skills/drawio-diagrams/SKILL.md` for the full palette and process-flow
guidance.

## Development

```bash
cd .pi/extensions/drawio && npm install   # install fast-xml-parser
node test/smoke.ts                         # create → parse → compress round-trip
```

## Limitations (v1)

- Single page per diagram (multi-page not yet supported).
- Custom shape libraries (AWS/Azure/GCP icons) not bundled; standard shapes only.
- Reading arbitrary hand-authored files preserves unknown cell attributes, but
  advanced `<UserObject>` custom-shape wrappers may not round-trip perfectly.
- The export→read-back verification only helps when the active model accepts
  image input.
