# pi-drawio

A local [draw.io](https://www.drawio.com) extension for the
[Pi coding agent](https://github.com/earendil-works/pi). It lets Pi create and
edit native `.drawio` diagrams **without an MCP server** — it builds the
mxGraphModel XML directly and optionally uses the draw.io desktop CLI for
auto-layout and PNG/SVG/PDF export.

Distributed as a [Pi package](https://pi.dev/packages) (the `pi-package`
keyword + a `pi` manifest in `package.json`), publishable to npm.

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

## Install

### From npm (after publishing)

```bash
pi install npm:@lauritz30/pi-drawio
```

This installs the extension and its coloring skill as one unit, together with
its `fast-xml-parser` dependency.

### In this repo (development)

The extension lives in `.pi/extensions/drawio/` and the skill in
`.pi/skills/drawio-diagrams/`, so both are discovered automatically when Pi
runs inside this repo (after project trust). Install the one runtime
dependency once:

```bash
npm install
```

### Global (symlink)

To use the repo checkout from any project without installing from npm:

```bash
mkdir -p ~/.pi/agent/extensions ~/.pi/agent/skills
ln -s "$(pwd)/.pi/extensions/drawio" ~/.pi/agent/extensions/drawio
ln -s "$(pwd)/.pi/skills/drawio-diagrams" ~/.pi/agent/skills/drawio-diagrams
```

Restart Pi (or run `/reload`).

## Dependencies

- **`fast-xml-parser`** — the only runtime dependency (declared in
  `dependencies`, installed automatically by `pi install`).
- **draw.io desktop app** ([diagrams.net](https://www.diagrams.net)) — optional;
  enables PNG/SVG/PDF export and ELK/`libavoid` layout. Auto-detected on macOS
  at `/Applications/draw.io.app/Contents/MacOS/draw.io`; override with
  `DRAWIO_PATH`.
- Pi host packages (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`)
  are declared as `peerDependencies` and provided by Pi itself.

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

## Publishing to npm

Publishing uses **npm Trusted Publishing** (no token stored in the repo) via the
workflow in `.github/workflows/publish.yml`.

One-time setup on npmjs.com:

1. Create the package (or claim it) on npm.
2. Go to the package → **Settings → Publishing access**.
3. Enable **"Require two-factor authentication or automation"**.
4. Under **Trusted Publishing**, add: owner=`Lauritz30`, repo=`pi-drawio`,
   workflow path=`.github/workflows/publish.yml`.

Then cut a GitHub release (or run the workflow manually). The workflow runs
`npm publish --provenance --access public`, with provenance proving the build
came from this repo.

## Layout

```
pi-drawio/
├── package.json               # npm package: name, `pi` manifest, deps
├── .pi/
│   ├── extensions/drawio/     # extension (index.ts + src/)
│   └── skills/drawio-diagrams/  # coloring skill (SKILL.md)
├── .github/workflows/publish.yml
├── test/smoke.ts              # end-to-end smoke test
├── LICENSE
└── README.md
```

## Development

```bash
npm install        # install fast-xml-parser
npm test           # node test/smoke.ts  (create → parse → compressed round-trip)
```

## Limitations (v1)

- Single page per diagram (multi-page not yet supported).
- Custom shape libraries (AWS/Azure/GCP icons) not bundled; standard shapes only.
- Reading arbitrary hand-authored files preserves unknown cell attributes, but
  advanced `<UserObject>` custom-shape wrappers may not round-trip perfectly.
- The export→read-back verification only helps when the active model accepts
  image input.
