import type { ScenePart } from '../types/robotics';
import { boxCenter, boxContains, boxVolume, sub } from './guideMath';
import { isMajor, itemKeyOf } from './guideItems';
import type { Box, V3 } from './guideTypes';

export interface PlanContext {
  byId: Map<string, ScenePart>;
  boxes: Record<string, Box>;
  contacts: Record<string, string[]>;
  axes: Record<string, V3>;
  size: number;
  order?: { rank: Map<string, number>; unproven: Set<string> };
}

export interface FastenerHome {
  module: string;
  gate: string[];
  atAttach: boolean;
}

const EMPTY_BOX: Box = { min: [0, 0, 0], max: [0, 0, 0] };

export const boxOfPart = (ctx: PlanContext, id: string) => ctx.boxes[id] ?? EMPTY_BOX;

export const touching = (ctx: PlanContext, id: string) => (ctx.contacts[id] ?? []).filter((o) => ctx.byId.has(o));

const majorsTouching = (ctx: PlanContext, id: string) => touching(ctx, id).filter((o) => isMajor(ctx.byId.get(o)!));

const distance = (ctx: PlanContext, a: string, b: string) =>
  Math.hypot(...sub(boxCenter(boxOfPart(ctx, a)), boxCenter(boxOfPart(ctx, b))));

function nearest(ctx: PlanContext, id: string, among: string[]): string | null {
  let best: string | null = null;

  for (const other of among) if (!best || distance(ctx, id, other) < distance(ctx, id, best)) best = other;

  return best;
}

const COVER_WORDS = /\b(shell|cover|lid|hatch|cap|case|casing|housing|visor|panel|skin|fairing|guard)\b/i;

export const isCover = (p: ScenePart) => COVER_WORDS.test(p.name);

function enclosedBy(ctx: PlanContext, majors: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();

  for (const m of majors) {
    const box = boxOfPart(ctx, m);
    const volume = boxVolume(box);
    const inside = (o: string) =>
      o !== m && boxVolume(boxOfPart(ctx, o)) < volume * 0.5 && boxContains(box, boxCenter(boxOfPart(ctx, o)));

    out.set(m, isCover(ctx.byId.get(m)!) ? majors.filter(inside) : []);
  }

  return out;
}

interface Score {
  linked: number;
  near: number;
  low: number;
  volume: number;
}

interface PlacementScore extends Score {
  center: V3;
  distance: number;
}

const better = (a: Score, b: Score) => a.linked - b.linked || a.near - b.near || a.low - b.low || a.volume - b.volume;

const NEAR_STEP_MM = 5;

const biggest = (ctx: PlanContext, ids: string[]) =>
  ids.reduce((a, b) => (boxVolume(boxOfPart(ctx, b)) > boxVolume(boxOfPart(ctx, a)) ? b : a));

function placementScores(ctx: PlanContext, majors: string[]) {
  const scores = new Map<string, PlacementScore>();
  const touchingIds = new Map<string, string[]>();

  for (const id of majors) {
    const box = boxOfPart(ctx, id);

    scores.set(id, {
      linked: 0,
      near: -Infinity,
      low: -box.min[1],
      volume: boxVolume(box),
      center: boxCenter(box),
      distance: Infinity,
    });

    for (const other of touching(ctx, id)) {
      const linked = touchingIds.get(other) ?? [];

      linked.push(id);
      touchingIds.set(other, linked);
    }
  }

  const add = (anchor: string) => {
    const center = boxCenter(boxOfPart(ctx, anchor));

    for (const score of scores.values()) {
      const gap = Math.min(
        score.distance,
        Math.hypot(score.center[0] - center[0], score.center[1] - center[1], score.center[2] - center[2]),
      );

      score.distance = gap;
      score.near = -Math.round(gap / NEAR_STEP_MM);
    }

    for (const id of touchingIds.get(anchor) ?? []) {
      const score = scores.get(id);

      if (score) score.linked += 1;
    }
  };
  const place = (id: string) => {
    scores.delete(id);
    add(id);
  };

  return { scores, place };
}

function pickNext(candidates: string[], scores: Map<string, Score>): string {
  return candidates.reduce((best, id) => (better(scores.get(id)!, scores.get(best)!) > 0 ? id : best));
}

function firstMajor(ctx: PlanContext, candidates: string[], outside: Set<string>): string {
  if (!outside.size || candidates.length === 1) return biggest(ctx, candidates);

  const scores = new Map(
    candidates.map((id) => [
      id,
      {
        linked: touching(ctx, id).filter((other) => outside.has(other)).length,
        near: -Math.round(Math.min(...[...outside].map((other) => distance(ctx, id, other))) / NEAR_STEP_MM),
        low: -boxOfPart(ctx, id).min[1],
        volume: boxVolume(boxOfPart(ctx, id)),
      },
    ]),
  );

  return pickNext(candidates, scores);
}

function candidatesOf(ctx: PlanContext, open: string[], ready: string[]): string[] {
  const pool = ready.length ? ready : open;
  const frames = pool.filter((id) => !isCover(ctx.byId.get(id)!));

  return frames.length ? frames : pool;
}

export function orderMajors(ctx: PlanContext, majors: string[], outside: Set<string>): string[] {
  const rank = ctx.order?.rank;

  if (!rank) return heuristicOrder(ctx, majors, outside);

  const proven = majors.filter((m) => rank.has(m)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  const rest = majors.filter((m) => !rank.has(m));

  return [...heuristicOrder(ctx, rest, outside), ...proven];
}

export const isUnproven = (ctx: PlanContext, ids: string[]) =>
  !!ctx.order && ids.some((id) => ctx.order!.unproven.has(id));

function heuristicOrder(ctx: PlanContext, majors: string[], outside: Set<string>): string[] {
  if (majors.length < 2) return [...majors];

  const enclosed = enclosedBy(ctx, majors);
  const placed = new Set<string>();
  const order: string[] = [];
  const scoring = placementScores(ctx, majors);

  while (order.length < majors.length) {
    const open = majors.filter((m) => !placed.has(m));
    const ready = open.filter((m) => enclosed.get(m)!.every((inner) => placed.has(inner)));
    const candidates = candidatesOf(ctx, open, ready);
    const next = order.length ? pickNext(candidates, scoring.scores) : firstMajor(ctx, candidates, outside);

    placed.add(next);
    order.push(next);
    scoring.place(next);
  }

  return order;
}

export function fastenerHomes(
  ctx: PlanContext,
  fasteners: string[],
  moduleOf: Map<string, string>,
  moduleRank: Map<string, number>,
): Map<string, FastenerHome> {
  const allMajors = [...ctx.byId.values()].filter(isMajor).map((p) => p.id);
  const homes = new Map<string, FastenerHome>();

  for (const f of fasteners) {
    const touched = majorsTouching(ctx, f);
    const gate = touched.length ? touched : [nearest(ctx, f, allMajors)].filter((x): x is string => !!x);
    const modules = [...new Set(gate.map((g) => moduleOf.get(g)!))];
    const last = modules.reduce((a, b) => ((moduleRank.get(b) ?? 0) > (moduleRank.get(a) ?? 0) ? b : a), modules[0]);

    homes.set(f, { module: last ?? moduleOf.get(f)!, gate, atAttach: modules.length > 1 });
  }

  return homes;
}

export function insertHosts(ctx: PlanContext, inserts: string[]): Map<string, string> {
  const allMajors = [...ctx.byId.values()].filter(isMajor).map((p) => p.id);
  const hosts = new Map<string, string>();
  const preference = (id: string) => (itemKeyOf(ctx.byId.get(id)!).startsWith('printed:') ? 0 : 1);

  for (const insert of inserts) {
    const touched = majorsTouching(ctx, insert).sort(
      (a, b) => preference(a) - preference(b) || boxVolume(boxOfPart(ctx, a)) - boxVolume(boxOfPart(ctx, b)),
    );
    const host = touched[0] ?? nearest(ctx, insert, allMajors);

    if (host) hosts.set(insert, host);
  }

  return hosts;
}
