import { add, boxContains, dot, frameOf, len, perpendiculars, scale, solidOf, sub } from './geometry.mjs';

const SCREWS = new Set(['socket_head', 'button_head', 'countersunk', 'pan_head', 'hex_bolt', 'set_screw']);
const RECEIVERS = new Set(['heat_insert', 'hex_nut', 'lock_nut', 'square_nut', 'standoff_ff', 'standoff_mf']);
const COAXIAL_COS = Math.cos((5 * Math.PI) / 180);
const COAXIAL_MM = 0.4;
const DRIVER_REACH_MM = 80;

const isPrintedSolid = (p) =>
  p.visible !== false && p.role === 'solid' && p.kind !== 'hardware' && p.kind !== 'component';
const nominal = (size) => Number(String(size).replace(/^M/i, '')) || 3;

function fastenerAxis(part) {
  const frame = frameOf(part);
  const axis = frame.axis([0, 1, 0]);
  const h = part.dimensions.height;

  return { axis, base: sub(part.position, scale(axis, h / 2)), h };
}

function screwGeometry(part) {
  const { axis, base: tip, h } = fastenerAxis(part);
  const L = part.hardware.length ?? h;
  const countersunk = part.hardware.type === 'countersunk';
  const thread = countersunk ? L * 0.85 : L;
  const headStart = countersunk ? thread : L;

  return {
    id: part.id,
    d: nominal(part.hardware.size),
    dk: part.dimensions.width,
    axis,
    tip,
    L,
    thread,
    headStart,
    headLen: h - headStart,
    at: (s) => add(tip, scale(axis, s)),
  };
}

function ring(g, s, radius) {
  const [u, v] = perpendiculars(g.axis);
  const c = g.at(s);

  return [u, v, scale(u, -1), scale(v, -1)].map((dir) => add(c, scale(dir, radius)));
}

function receiverEngagement(g, part) {
  const { axis, base, h } = fastenerAxis(part);

  if (Math.abs(dot(axis, g.axis)) < COAXIAL_COS) return 0;

  const mid = add(base, scale(axis, h / 2));
  const rel = sub(mid, g.tip);
  const along = dot(rel, g.axis);
  const radial = len(sub(rel, scale(g.axis, along)));

  if (radial > COAXIAL_MM) return 0;

  return Math.max(0, Math.min(g.thread, along + h / 2) - Math.max(0, along - h / 2));
}

const round2 = (v) => Math.round(v * 100) / 100;

function engagementOf(g, receivers, components) {
  const best = receivers
    .map((r) => ({ id: r.id, kind: r.hardware.type, mm: receiverEngagement(g, r), lengthMm: r.dimensions.height }))
    .sort((a, b) => b.mm - a.mm)[0];

  if (best?.mm > 0) return { ...best, mm: round2(best.mm) };

  const tapped = components.find((c) => boxContains(c, g.at(0.5)));

  return tapped ? { id: tapped.id, kind: 'component', mm: round2(1.5 * g.d), tapped: true } : null;
}

function hitsAt(points, solids) {
  const ids = new Set();

  for (const p of points) for (const s of solids) if (s.contains(p)) ids.add(s.id);

  return [...ids];
}

function countInside(points, solids) {
  return points.filter((p) => solids.some((s) => s.contains(p))).length;
}

function seatPartOf(points, solids) {
  const counts = new Map();

  for (const p of points) for (const s of solids) if (s.contains(p)) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function samples(from, to, step) {
  const out = [];

  for (let s = from; s <= to + 1e-9; s += step) out.push(s);

  return out;
}

function probeScrew(g, ctx) {
  const engaged = engagementOf(g, ctx.receivers, ctx.components);
  const shank = samples(0.4, g.headStart - 0.4, 0.5).map((s) => g.at(s));
  const ringRadius = (g.d / 2 + g.dk / 2) / 2;
  const under = ring(g, g.headStart - 0.3, ringRadius);
  const headTop = g.headStart + g.headLen;
  const driver = samples(headTop + 0.5, headTop + DRIVER_REACH_MM, 1).map((s) => g.at(s));
  const blockedBy = hitsAt(driver, ctx.solids);

  return {
    id: g.id,
    size: `M${g.d}`,
    lengthMm: g.L,
    engaged,
    engagementMm: engaged?.mm ?? 0,
    shankInMaterial: hitsAt(shank, ctx.solids),
    shankRubs: hitsAt(
      samples(0.4, g.headStart - 0.4, 1).flatMap((s) => ring(g, s, g.d / 2 - 0.1)),
      ctx.solids,
    ),
    headSeated: countInside(under, ctx.solids) >= 3,
    headSunk: countInside(ring(g, g.headStart + g.headLen / 2, ringRadius), ctx.solids) >= 2,
    driverClear: blockedBy.length === 0,
    blockedBy,
    seatPart: seatPartOf(under, ctx.solids),
  };
}

function receiverHost(part, solids) {
  const { axis, base, h } = fastenerAxis(part);
  const [u, v] = perpendiculars(axis);
  const mid = add(base, scale(axis, h / 2));
  const r = part.dimensions.width / 2 + 0.4;

  return seatPartOf(
    [u, v, scale(u, -1), scale(v, -1)].map((dir) => add(mid, scale(dir, r))),
    solids,
  );
}

export function probeFasteners(scene) {
  const parts = scene.parts ?? [];
  const solids = parts.filter(isPrintedSolid).map(solidOf).filter(Boolean);
  const receivers = parts.filter((p) => p.kind === 'hardware' && RECEIVERS.has(p.hardware?.type));
  const components = parts.filter((p) => p.kind === 'component');
  const ctx = { solids, receivers, components };
  const screws = parts
    .filter((p) => p.kind === 'hardware' && SCREWS.has(p.hardware?.type))
    .map((p) => probeScrew(screwGeometry(p), ctx));
  const used = new Set(screws.map((s) => s.engaged?.id).filter(Boolean));
  const inserts = receivers.map((r) => ({ id: r.id, host: receiverHost(r, solids), used: used.has(r.id) }));

  return { screws, inserts, orphanInserts: inserts.filter((i) => !i.used).map((i) => i.id) };
}

export function heldByEdges(probe) {
  const hostOf = new Map(probe.inserts.map((i) => [i.id, i.host]));

  return probe.screws
    .filter((s) => s.engaged && s.seatPart)
    .map((s) => ({ screw: s.id, a: s.seatPart, b: s.engaged.tapped ? s.engaged.id : hostOf.get(s.engaged.id) }))
    .filter((e) => e.b && e.a !== e.b);
}

export function connected(edges, from, to) {
  const seen = new Set([from]);
  const queue = [from];

  while (queue.length) {
    const at = queue.shift();

    if (at === to) return true;

    for (const e of edges) {
      const next = (e.a === at && e.b) || (e.b === at && e.a);

      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}
