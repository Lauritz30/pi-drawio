// draw.io desktop CLI integration: binary detection, export, ELK/layout
// passes, and opening files in the editor. None of this touches the MCP.

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ExportFormat } from "./types.ts";

const execFileAsync = promisify(execFile);

/** Locate the draw.io desktop CLI binary, or null if not installed. */
export function findDrawioSync(): string | null {
  const candidates: string[] = [];
  if (process.env.DRAWIO_PATH) candidates.push(process.env.DRAWIO_PATH);
  if (process.platform === "darwin") candidates.push("/Applications/draw.io.app/Contents/MacOS/draw.io");
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\draw.io\\draw.io.exe");
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "draw.io", "draw.io.exe"));
    }
  }
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  const names = process.platform === "win32" ? ["draw.io.exe", "drawio.exe"] : ["drawio", "draw.io"];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    for (const n of names) {
      const p = path.join(d, n);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runDrawio(args: string[], opts?: { cwd?: string; timeout?: number }): Promise<RunResult> {
  const bin = findDrawioSync();
  if (!bin) {
    throw new Error(
      "draw.io desktop CLI not found. Install draw.io (diagrams.net) desktop app " +
      "or set DRAWIO_PATH. Without it you can still create/edit/open .drawio files, " +
      "but PNG/SVG/PDF export and ELK/libavoid layout are unavailable.",
    );
  }
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: opts?.timeout ?? 120_000,
      cwd: opts?.cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? String(e), code: typeof err.code === "number" ? err.code : 1 };
  }
}

export interface ExportOptions {
  border?: number;
  scale?: number;
  transparent?: boolean;
  /** Optional ELK preset or libavoid to apply before export. */
  layout?: string;
}

/**
 * Export a .drawio file to png/svg/pdf (XML embedded, so the output stays
 * editable in draw.io). Returns the output path.
 */
export async function exportDiagram(
  inputAbs: string,
  format: ExportFormat,
  opts: ExportOptions = {},
): Promise<string> {
  const out = `${inputAbs}.${format}`;
  const args = ["-x", "-f", format, "-e", "-b", String(opts.border ?? 10)];
  if (opts.scale) args.push("-s", String(opts.scale));
  if (opts.transparent && format === "png") args.push("-t");
  if (opts.layout) args.push("--layout", opts.layout);
  args.push("-o", out, inputAbs);

  const res = await runDrawio(args);
  if (!existsSync(out)) {
    throw new Error(`draw.io export failed (no output file). ${res.stderr || res.stdout}`.trim());
  }
  return out;
}

/** Run a layout pass in place: `drawio -x -f xml --layout <layout> -o f f`. */
export async function applyLayout(inputAbs: string, layout: string): Promise<void> {
  const res = await runDrawio(["-x", "-f", "xml", "--layout", layout, "-o", inputAbs, inputAbs]);
  if (res.code !== 0 || !existsSync(inputAbs)) {
    throw new Error(`draw.io layout '${layout}' failed. ${res.stderr || res.stdout}`.trim());
  }
}

/** Open a file in the OS default handler / draw.io desktop app. */
export function openPath(p: string): void {
  if (process.platform === "darwin") {
    spawn("open", [p], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", p], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [p], { detached: true, stdio: "ignore" }).unref();
  }
}

export function drawioAvailable(): boolean {
  return findDrawioSync() !== null;
}
