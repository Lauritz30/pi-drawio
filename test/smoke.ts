// Smoke test for the pi-drawio core pipeline.
// Run: node test/smoke.ts

import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { createDiagram, listCells, readXml } from "../.pi/extensions/drawio/src/engine.ts";
import { parseDiagram, validateXml } from "../.pi/extensions/drawio/src/parse.ts";
import { serializeDiagram } from "../.pi/extensions/drawio/src/serialize.ts";

const dir = join(tmpdir(), "pi-drawio-smoke");
const file = join(dir, "order-process.drawio");

const r = await createDiagram({
  cwd: dir,
  path: file,
  title: "Order process",
  open: false,
  layout: "layered",
  lanes: [
    {
      id: "customer",
      name: "Customer",
      role: "customer",
      nodes: [
        { id: "start", label: "Place order", shape: "terminator" },
        { id: "receive", label: "Receive goods", shape: "rounded" },
      ],
    },
    {
      id: "backend",
      name: "Backend",
      role: "backend",
      nodes: [
        { id: "validate", label: "Validate order", shape: "rounded" },
        { id: "ship", label: "Ship order", shape: "rounded" },
      ],
    },
  ],
  edges: [
    { source: "start", target: "validate" },
    { source: "validate", target: "ship" },
    { source: "ship", target: "receive" },
  ],
});

console.log("=== CREATE ===");
console.log(JSON.stringify(r, null, 2));

const xml = readXml({ cwd: dir, path: file }).xml;
console.log("\n=== VALIDATE ===");
console.log("well-formed:", validateXml(xml));
console.log("\n=== XML ===\n" + xml);

const parsed = parseDiagram(xml);
console.log("\n=== ROUND-TRIP PARSE ===");
console.log("pages:", parsed.pages.length, "cells:", parsed.pages[0].cells.length);

console.log("\n=== LIST ===");
for (const c of listCells({ cwd: dir, path: file }).cells) {
  const g = c.geometry;
  console.log(
    `${c.id} [${c.kind}] label="${c.label ?? ""}" parent="${c.parent ?? ""}"` +
      (g ? ` (${g.x},${g.y} ${g.width}x${g.height})` : ""),
  );
}

console.log("\n=== COMPRESSED DIAGRAM DECODE ===");
const modelXml = xml.match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/)?.[0] ?? xml;
const compressed = deflateRawSync(Buffer.from(encodeURIComponent(modelXml))).toString("base64");
const compressedFile = `<mxfile host="x"><diagram id="p-1" name="P">${compressed}</diagram></mxfile>`;
const parsed2 = parseDiagram(compressedFile);
console.log("cells decoded from compressed body:", parsed2.pages[0].cells.length);

console.log("\n=== SERIALIZE EMPTY (id 0 / id 1 only) ===");
console.log(serializeDiagram({ pages: [{ id: "p-1", name: "P", cells: [{ id: "0" }, { id: "1", parent: "0" }] }] }));

console.log("\nSMOKE TEST DONE");
