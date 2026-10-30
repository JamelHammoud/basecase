import * as THREE from 'three';
import type { Placed } from '../three/analysis/collide';
import type { ChainProblem, ChainResult, FastenerChain, FastenerInput, SleeveHost, ThreadEnd } from './assemblyTypes';
import type { ScrewSpec, SleeveSpec } from './fastenerSpec';
import { frameOf, insideSolid, isNear, ringAround, type Frame } from './probe';

interface PlacedSleeve {
  spec: SleeveSpec;
  placed: Placed;
  frame: Frame;
}

interface Span {
  sleeve: PlacedSleeve;
  a: number;
  b: number;
}

interface ScrewCtx {
  spec: ScrewSpec;
  tip: THREE.Vector3;
  u: THREE.Vector3;
  underT: number;
  topT: number;
  solids: Placed[];
  printed: Set<string>;
  spans: Span[];
  washers: PlacedSleeve[];
}

const STEP_MM = 0.25;
const at = (ctx: ScrewCtx, t: number) => ctx.tip.clone().addScaledVector(ctx.u, t);
const bites = (o: Placed, p: THREE.Vector3, d: number) => isNear(o, p, d * 0.5);
const round1 = (v: number) => Math.round(v * 10) / 10;

function sleeveSpan(ctx: Pick<ScrewCtx, 'tip' | 'u' | 'spec'>, sleeve: PlacedSleeve): Span | null {
  const { frame, spec } = sleeve;

  if (Math.abs(frame.axis.dot(ctx.u)) < 0.9) return null;

  const rel = frame.at((spec.y0 + spec.y1) / 2).sub(ctx.tip);
  const radial = rel
    .clone()
    .sub(ctx.u.clone().multiplyScalar(rel.dot(ctx.u)))
    .length();

  if (radial > Math.min(1, ctx.spec.d * 0.4)) return null;

  const ends = [frame.at(spec.y0), frame.at(spec.y1)].map((p) => p.sub(ctx.tip).dot(ctx.u));

  return { sleeve, a: Math.min(...ends), b: Math.max(...ends) };
}

const overlap = (ctx: ScrewCtx, s: Span) => Math.min(s.b, ctx.underT) - Math.max(s.a, 0);

function receiverOf(ctx: ScrewCtx): Span | null {
  const receivers = ctx.spans.filter((s) => s.sleeve.spec.kind !== 'washer' && overlap(ctx, s) > 0.2);

  return receivers.sort((x, y) => overlap(ctx, y) - overlap(ctx, x))[0] ?? null;
}

function biteRun(ctx: ScrewCtx, host: Placed, from: number): number {
  let t = from;

  while (t < ctx.underT && bites(host, at(ctx, t), ctx.spec.d)) t += STEP_MM;

  return Math.max(0, t - from);
}

function threadHost(ctx: ScrewCtx): Placed | null {
  for (const t of [0.4, 0.9]) {
    const host = ctx.solids.find((o) => bites(o, at(ctx, t), ctx.spec.d));

    if (host) return host;
  }

  return null;
}

function bottomsPast(ctx: ScrewCtx, span: Span): ChainProblem | null {
  if (span.sleeve.spec.kind !== 'insert' || span.a < 0.5) return null;

  for (const o of ctx.solids.filter((s) => ctx.printed.has(s.id))) {
    const run = biteRun(ctx, o, 0.3);

    if (run >= 0.5) return { code: 'bottoms', part: o.id, mm: round1(Math.min(run, span.a)) };
  }

  return null;
}

function uncutHole(ctx: ScrewCtx): ChainProblem | null {
  const runs = new Map<string, number>();

  for (let t = 0.3; t < ctx.underT - 0.3; t += 0.5) {
    const p = at(ctx, t);

    for (const o of ctx.solids) {
      if (ctx.printed.has(o.id) && insideSolid(o, p)) runs.set(o.id, (runs.get(o.id) ?? 0) + 0.5);
    }
  }

  const worst = [...runs].sort((x, y) => y[1] - x[1])[0];

  return worst && worst[1] >= 1 ? { code: 'uncut', part: worst[0], mm: worst[1] } : null;
}

function onWasher(ctx: ScrewCtx, p: THREE.Vector3): boolean {
  return ctx.washers.some(({ placed, spec }) => {
    const q = p.clone().applyMatrix4(placed.inverse);
    const radial = Math.hypot(q.x, q.z);

    return q.y >= spec.y0 - 0.5 && q.y <= spec.y1 + 0.5 && radial <= spec.outerR + 0.3;
  });
}

function seatRing(ctx: ScrewCtx): THREE.Vector3[] {
  const { spec } = ctx;
  const r0 = spec.d / 2;

  if (!spec.countersunk) return ringAround(at(ctx, ctx.underT - 0.4), ctx.u, (spec.headR + r0 * 1.2) / 2);

  const f = 0.6;

  return ringAround(at(ctx, ctx.underT + f * (ctx.topT - ctx.underT)), ctx.u, r0 + f * (spec.headR - r0) + 0.4);
}

function isSeated(ctx: ScrewCtx): boolean {
  const touching = seatRing(ctx).filter((q) => onWasher(ctx, q) || ctx.solids.some((o) => isNear(o, q, 0.45)));

  return touching.length >= 3;
}

function sunkIn(ctx: ScrewCtx): ChainProblem | null {
  const mid = ctx.spec.countersunk ? ctx.topT - 0.3 : (ctx.underT + ctx.topT) / 2;
  const ring = ringAround(at(ctx, mid), ctx.u, ctx.spec.headR * 0.75);
  const host = ctx.solids.find((o) => ring.filter((q) => insideSolid(o, q)).length >= 3);

  return host ? { code: 'sunk', part: host.id } : null;
}

function stackOf(ctx: ScrewCtx, extra: Array<string | null>): string[] {
  const seen = new Map<string, number>();

  for (let t = 0; t < ctx.underT - 0.2; t += 0.6) {
    const p = at(ctx, t);

    for (const o of ctx.solids) if (isNear(o, p, ctx.spec.d / 2 + 1)) seen.set(o.id, Math.max(seen.get(o.id) ?? 0, t));
  }

  for (const id of extra) if (id && !seen.has(id)) seen.set(id, 0);

  return [...seen].sort((x, y) => y[1] - x[1]).map(([id]) => id);
}

interface ThreadResult {
  kind: ThreadEnd;
  id?: string;
  engagementMm: number;
  needMm: number | null;
  problems: ChainProblem[];
}

function sleeveThread(ctx: ScrewCtx, span: Span): ThreadResult {
  const { spec } = span.sleeve;
  const len = spec.y1 - spec.y0;
  const bottoms = bottomsPast(ctx, span);

  return {
    kind: spec.kind === 'nut' ? 'nut' : 'insert',
    id: spec.id,
    engagementMm: round1(overlap(ctx, span)),
    needMm: round1(spec.kind === 'nut' ? len - 0.3 : Math.min(len, ctx.spec.d * 1.5) - 0.3),
    problems: bottoms ? [bottoms] : [],
  };
}

function hostThread(ctx: ScrewCtx): ThreadResult {
  const host = threadHost(ctx);

  if (!host) return { kind: 'none', engagementMm: 0, needMm: null, problems: [{ code: 'air' }] };

  const printed = ctx.printed.has(host.id);

  return {
    kind: printed ? 'printed' : 'component',
    id: host.id,
    engagementMm: round1(biteRun(ctx, host, 0.4) + 0.4),
    needMm: printed ? round1(ctx.spec.d * 1.5) : null,
    problems: [],
  };
}

function chainOf(ctx: ScrewCtx, hosts: Map<string, SleeveHost>): FastenerChain {
  const span = receiverOf(ctx);
  const thread = span ? sleeveThread(ctx, span) : hostThread(ctx);
  const problems = [...thread.problems];
  const uncut = uncutHole(ctx);

  if (thread.needMm !== null && thread.engagementMm < thread.needMm)
    problems.push({ code: 'short', mm: thread.engagementMm });

  if (uncut) problems.push(uncut);

  const sunk = sunkIn(ctx);

  if (sunk) problems.push(sunk);
  else if (!isSeated(ctx)) problems.push({ code: 'unseated' });

  if (span) hosts.get(span.sleeve.spec.id)!.screw = ctx.spec.id;

  const hostOfSleeve = span ? (hosts.get(span.sleeve.spec.id)?.host ?? null) : null;

  return {
    id: ctx.spec.id,
    d: ctx.spec.d,
    axis: ctx.u.toArray(),
    tip: ctx.tip.toArray(),
    top: at(ctx, ctx.topT).toArray(),
    headR: ctx.spec.headR,
    stack: stackOf(ctx, [hostOfSleeve]),
    endsIn: { kind: thread.kind, id: thread.id },
    engagementMm: thread.engagementMm,
    needMm: thread.needMm,
    problems,
  };
}

function sleeveHost(sleeve: PlacedSleeve, solids: Placed[]): SleeveHost {
  const { spec, frame } = sleeve;
  const centre = frame.at((spec.y0 + spec.y1) / 2);
  const ring = ringAround(centre, frame.axis, spec.outerR + 0.4);
  const near = solids.filter((o) => o.box.distanceToPoint(centre) < spec.outerR + 2);
  const scored = near
    .map((o) => ({ id: o.id, n: ring.filter((q) => isNear(o, q, 0.5)).length }))
    .sort((x, y) => y.n - x.n);
  const host = scored[0]?.n >= 3 ? scored[0].id : null;

  return { id: spec.id, kind: spec.kind, host: spec.kind === 'washer' ? null : host, screw: null };
}

export function traceFasteners(placed: Placed[], input: FastenerInput): ChainResult {
  const byId = new Map(placed.map((p) => [p.id, p]));
  const solids = placed.filter((p) => input.roles[p.id] === 'printed' || input.roles[p.id] === 'component');
  const printed = new Set(solids.filter((p) => input.roles[p.id] === 'printed').map((p) => p.id));
  const sleeves: PlacedSleeve[] = input.specs
    .filter((s): s is SleeveSpec => s.kind !== 'screw' && byId.has(s.id))
    .map((spec) => ({ spec, placed: byId.get(spec.id)!, frame: frameOf(byId.get(spec.id)!) }));
  const hosts = new Map(sleeves.map((s) => [s.spec.id, sleeveHost(s, solids)]));
  const screws = input.specs
    .filter((s): s is ScrewSpec => s.kind === 'screw' && byId.has(s.id))
    .map((spec) => chainOf(screwContext(spec, byId.get(spec.id)!, { solids, printed, sleeves }), hosts));

  return { screws, sleeves: [...hosts.values()] };
}

interface Scene {
  solids: Placed[];
  printed: Set<string>;
  sleeves: PlacedSleeve[];
}

function screwContext(spec: ScrewSpec, placed: Placed, scene: Scene): ScrewCtx {
  const frame = frameOf(placed);
  const tip = frame.at(spec.tipY);
  const reach = new THREE.Box3().setFromPoints([tip, frame.at(spec.topY)]).expandByScalar(spec.headR + 1.5);
  const base = { spec, tip, u: frame.axis };
  const spans = scene.sleeves
    .filter((s) => s.placed.box.intersectsBox(reach))
    .map((s) => sleeveSpan(base, s))
    .filter((s): s is Span => s !== null);

  return {
    ...base,
    underT: spec.underY - spec.tipY,
    topT: spec.topY - spec.tipY,
    solids: scene.solids.filter((o) => o.box.intersectsBox(reach)),
    printed: scene.printed,
    spans,
    washers: spans.filter((s) => s.sleeve.spec.kind === 'washer').map((s) => s.sleeve),
  };
}
