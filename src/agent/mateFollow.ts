import type { PartMate } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { applySpec } from './agentScene';
import { planMate } from './mate';

export interface MateFollowInput {
  before: ScenePart[];
  after: ScenePart[];
  placed: Set<string>;
}

export interface MateFollowResult {
  updated: ScenePart[];
  followed: string[];
  released: string[];
  notes: string[];
}

const POSITION_MM = 0.01;
const ROTATION_DEG = 0.05;
const MAX_PASSES = 8;

const mateName = (id: string, m: PartMate) => `${id}:${m.port} → ${m.target}:${m.targetPort}`;

const close = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

const samePose = (a: ScenePart, b: ScenePart) =>
  close(a.position, b.position, POSITION_MM) && close(a.rotation, b.rotation, ROTATION_DEG);

function geometryChanged(a: ScenePart | undefined, b: ScenePart): boolean {
  if (!a) return true;

  return a.cad !== b.cad || !samePose(a, b);
}

const placing = (p: ScenePart): PartMate | undefined => p.mates?.[p.mates.length - 1];

interface FollowState {
  parts: Map<string, ScenePart>;
  changed: Set<string>;
  recompiled: Set<string>;
  placed: Set<string>;
  result: MateFollowResult;
  broken: Set<string>;
  touched: Set<string>;
}

function release(state: FollowState, part: ScenePart, mate: PartMate) {
  const kept = (part.mates ?? []).filter((m) => m !== mate);

  state.parts.set(part.id, { ...part, mates: kept.length ? kept : undefined });
  state.result.released.push(part.id);
  state.touched.add(part.id);
  state.result.notes.push(
    `Released mate ${mateName(part.id, mate)}: ${part.id} was moved by hand. Mate it again to keep it.`,
  );
}

function warnBroken(state: FollowState, part: ScenePart, what: string) {
  if (state.broken.has(part.id)) return;

  state.broken.add(part.id);
  state.result.notes.push(`${what} ${part.id} stays where it is; restore the port or mate it again.`);
}

function follow(state: FollowState, part: ScenePart): boolean {
  const mate = placing(part);

  if (!mate || !(state.changed.has(part.id) || state.changed.has(mate.target))) return false;

  const plan = planMate([...state.parts.values()], { ...mate, part: part.id });

  if (typeof plan === 'string') {
    warnBroken(state, part, `Broken mate ${mateName(part.id, mate)}: ${plan}`);

    return false;
  }

  const next = applySpec(part, plan.op.op === 'update' ? plan.op.part : { id: part.id });

  if (samePose(next, part)) return false;

  const byHand = state.placed.has(part.id) && !state.changed.has(mate.target) && !state.recompiled.has(part.id);

  if (byHand) {
    release(state, part, mate);

    return false;
  }

  state.parts.set(part.id, next);
  state.changed.add(part.id);
  state.touched.add(part.id);

  if (!state.result.followed.includes(part.id)) state.result.followed.push(part.id);

  return true;
}

export function followMates({ before, after, placed }: MateFollowInput): MateFollowResult {
  const was = new Map(before.map((p) => [p.id, p]));
  const state: FollowState = {
    parts: new Map(after.map((p) => [p.id, p])),
    changed: new Set(after.filter((p) => geometryChanged(was.get(p.id), p)).map((p) => p.id)),
    recompiled: new Set(after.filter((p) => was.get(p.id) && was.get(p.id)!.cad !== p.cad).map((p) => p.id)),
    placed,
    result: { updated: [], followed: [], released: [], notes: [] },
    broken: new Set(),
    touched: new Set(),
  };
  const gone = before.filter((p) => !state.parts.has(p.id)).map((p) => p.id);

  for (const id of gone) state.changed.add(id);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const mated = [...state.parts.values()].filter((p) => p.mates?.length);
    const progressed = mated.map((p) => follow(state, state.parts.get(p.id)!)).some(Boolean);

    if (!progressed) break;
  }

  state.result.updated = [...state.touched].map((id) => state.parts.get(id)!);

  return state.result;
}

export function followedText(result: MateFollowResult): string[] {
  const ids = result.followed;

  return ids.length ? [`Moved with their mates: ${ids.join(', ')}.`, ...result.notes] : result.notes;
}
