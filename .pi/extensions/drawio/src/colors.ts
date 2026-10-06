// Role/lane color assignment.
//
// One role = one color, deterministically, so the same role keeps the same
// color across diagrams. A role name maps to a palette slot via a stable
// string hash; within a single diagram collisions are resolved so distinct
// roles always get distinct colors.

export interface RoleColor {
  name: string;
  /** Shape body / lane body fill. */
  fill: string;
  /** Border / connector stroke. */
  stroke: string;
  /** Slightly stronger fill for swimlane headers. */
  header: string;
}

// Light, accessible fills (100-series) with mid-tone strokes (500-series).
export const PALETTE: RoleColor[] = [
  { name: "blue",    fill: "#DBEAFE", stroke: "#3B82F6", header: "#BFDBFE" },
  { name: "green",   fill: "#D1FAE5", stroke: "#10B981", header: "#A7F3D0" },
  { name: "red",     fill: "#FEE2E2", stroke: "#EF4444", header: "#FECACA" },
  { name: "amber",   fill: "#FEF3C7", stroke: "#F59E0B", header: "#FDE68A" },
  { name: "purple",  fill: "#EDE9FE", stroke: "#8B5CF6", header: "#DDD6FE" },
  { name: "pink",    fill: "#FCE7F3", stroke: "#EC4899", header: "#FBCFE8" },
  { name: "cyan",    fill: "#CFFAFE", stroke: "#06B6D4", header: "#A5F3FC" },
  { name: "teal",    fill: "#CCFBF1", stroke: "#14B8A6", header: "#99F6E4" },
  { name: "indigo",  fill: "#E0E7FF", stroke: "#6366F1", header: "#C7D2FE" },
  { name: "orange",  fill: "#FFEDD5", stroke: "#F97316", header: "#FED7AA" },
  { name: "lime",    fill: "#ECFCCB", stroke: "#84CC16", header: "#D9F99D" },
  { name: "slate",   fill: "#F1F5F9", stroke: "#64748B", header: "#E2E8F0" },
];

// draw.io's classic default shape fill, used for un-colored nodes.
export const DEFAULT_COLOR: RoleColor = {
  name: "default-blue",
  fill: "#DAE8FC",
  stroke: "#6C8EBF",
  header: "#DAE8FC",
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function colorByIndex(i: number): RoleColor {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/** Stable palette index for a role name (0..PALETTE.length-1). */
export function colorIndexFor(role: string): number {
  const r = role.trim();
  const byName = PALETTE.findIndex((c) => c.name.toLowerCase() === r.toLowerCase());
  if (byName >= 0) return byName;
  return hashString(r) % PALETTE.length;
}

/** Deterministic color for a single role (collisions possible with many roles). */
export function roleColor(role?: string): RoleColor {
  if (!role) return DEFAULT_COLOR;
  return PALETTE[colorIndexFor(role)];
}

/**
 * Assign a distinct palette color to each role key, in first-seen order.
 * Colors stay stable across diagrams (hash-based), but collisions within the
 * same diagram are resolved so two roles never share a color there.
 */
export function assignRoleColors(roles: string[]): Map<string, RoleColor> {
  const map = new Map<string, RoleColor>();
  const used = new Set<number>();
  for (const r of roles) {
    if (map.has(r)) continue;
    let idx = colorIndexFor(r);
    while (used.has(idx)) idx = (idx + 1) % PALETTE.length;
    used.add(idx);
    map.set(r, PALETTE[idx]);
  }
  return map;
}

/** Read the fill/stroke colors back out of a style string, if present. */
export function parseColor(style?: string): RoleColor | undefined {
  if (!style) return undefined;
  const fill = /(?:^|;)fillColor=([^;]+)/.exec(style)?.[1];
  const stroke = /(?:^|;)strokeColor=([^;]+)/.exec(style)?.[1];
  const header = /(?:^|;)swimlaneFillColor=([^;]+)/.exec(style)?.[1];
  if (!fill && !stroke) return undefined;
  return {
    name: "custom",
    fill: fill ?? "#FFFFFF",
    stroke: stroke ?? "#333333",
    header: header ?? fill ?? "#FFFFFF",
  };
}
