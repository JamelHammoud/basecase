import type { AssemblyGeometry } from './assemblyGeometry';
import type { FastenerChain } from './assemblyTypes';
import type { DriverTool } from './driverAccess';
import { AXES } from './moveBlockers';

export type ScrewVerdict =
  | { verdict: 'pass' }
  | { verdict: 'note'; before: string[] }
  | { verdict: 'tool'; tool: DriverTool }
  | { verdict: 'stuck'; blockers: string[] };

export interface RemovalStep {
  kind: 'screw' | 'part' | 'unit';
  ids: string[];
}

export interface RemovalPlan {
  steps: RemovalStep[];
  screws: Record<string, ScrewVerdict>;
  stuckParts: string[];
}

interface State {
  g: AssemblyGeometry;
  groups: Record<string, string | undefined>;
  present: Set<string>;
  tracked: Set<string>;
  hosted: Map<string, string[]>;
  steps: RemovalStep[];
  tools: Map<string, DriverTool>;
}

const live = (s: State, ids: Iterable<string>) => [...ids].filter((id) => s.tracked.has(id) && s.present.has(id));
const clear = (s: State, ids: Iterable<string>) => live(s, ids).length === 0;
const majorsOf = (s: State) => Object.keys(s.g.moves);
const chainsOf = (s: State) => s.g.chains.screws;

function drop(s: State, ids: string[], kind: RemovalStep['kind']) {
  const out = ids.flatMap((id) => [id, ...(s.hosted.get(id) ?? [])]).filter((id) => s.present.has(id));

  out.forEach((id) => s.present.delete(id));
  s.steps.push({ kind, ids: out });
}

function removeScrews(s: State): boolean {
  let progress = false;

  for (const c of chainsOf(s)) {
    const option = s.present.has(c.id) ? s.g.drivers[c.id]?.find((o) => clear(s, o.blockers)) : undefined;

    if (!option) continue;

    s.tools.set(c.id, option.tool);
    drop(s, [c.id], 'screw');
    progress = true;
  }

  return progress;
}

const pinned = (s: State, id: string) => chainsOf(s).some((c) => s.present.has(c.id) && c.stack.includes(id));

function removeParts(s: State): boolean {
  let progress = false;

  for (const id of majorsOf(s)) {
    const free = s.present.has(id) && !pinned(s, id) && s.g.moves[id].local.some((b) => clear(s, b));

    if (!free) continue;

    drop(s, [id], 'part');
    progress = true;
  }

  return progress;
}

function candidateUnits(s: State): string[][] {
  const units = new Map<string, string[]>();
  const present = majorsOf(s).filter((id) => s.present.has(id));

  for (const id of present) {
    const g = s.groups[id];

    if (g) units.set(g, [...(units.get(g) ?? []), id]);
  }

  const out = [...units.values()].filter((u) => u.length > 1);
  const blocks = (a: string, b: string) => s.g.moves[a].local.some((set) => set.includes(b));

  for (const a of present) for (const b of present) if (a < b && blocks(a, b) && blocks(b, a)) out.push([a, b]);

  return out.sort((x, y) => x.length - y.length);
}

function crossesUnit(s: State, unit: Set<string>, c: FastenerChain) {
  const stack = live(s, c.stack);

  return s.present.has(c.id) && stack.some((h) => unit.has(h)) && stack.some((h) => !unit.has(h));
}

function unitFree(s: State, unit: Set<string>): boolean {
  const insideUnit = (b: string) => {
    const chain = chainsOf(s).find((c) => c.id === b);

    return unit.has(b) || (!!chain && chain.stack.every((h) => unit.has(h) || !s.present.has(h)));
  };

  return AXES.some((_, k) => [...unit].every((m) => live(s, s.g.moves[m].local[k] ?? []).every(insideUnit)));
}

function removeUnit(s: State): boolean {
  for (const members of candidateUnits(s)) {
    const unit = new Set(members);

    if (chainsOf(s).some((c) => crossesUnit(s, unit, c)) || !unitFree(s, unit)) continue;

    const screws = chainsOf(s)
      .filter((c) => s.present.has(c.id) && c.stack.every((h) => unit.has(h) || !s.present.has(h)))
      .map((c) => c.id);

    drop(s, [...members, ...screws], 'unit');

    return true;
  }

  return false;
}

function verdictOf(s: State, c: FastenerChain): ScrewVerdict {
  const options = s.g.drivers[c.id] ?? [];

  if (s.present.has(c.id)) {
    return { verdict: 'stuck', blockers: options[0]?.blockers.filter((b) => s.tracked.has(b)) ?? [] };
  }

  const tool = s.tools.get(c.id);
  const straight = options[0]?.blockers.filter((b) => s.tracked.has(b)) ?? [];

  if (tool !== 'straight') return { verdict: 'tool', tool: tool ?? 'L-key' };

  return straight.length ? { verdict: 'note', before: straight } : { verdict: 'pass' };
}

function hostedMap(g: AssemblyGeometry): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (owner: string, id: string) => out.set(owner, [...(out.get(owner) ?? []), id]);

  for (const sl of g.chains.sleeves) {
    const owner = sl.kind === 'insert' ? sl.host : (sl.screw ?? sl.host);

    if (owner) add(owner, sl.id);
  }

  return out;
}

export function planRemoval(g: AssemblyGeometry, groups: Record<string, string | undefined>): RemovalPlan {
  const tracked = new Set([
    ...Object.keys(g.moves),
    ...g.chains.screws.map((c) => c.id),
    ...g.chains.sleeves.map((x) => x.id),
  ]);
  const s: State = { g, groups, present: new Set(tracked), tracked, hosted: hostedMap(g), steps: [], tools: new Map() };
  let progress = true;

  while (progress) {
    const screws = removeScrews(s);
    const parts = removeParts(s);

    progress = screws || parts || removeUnit(s);
  }

  return {
    steps: s.steps,
    screws: Object.fromEntries(chainsOf(s).map((c) => [c.id, verdictOf(s, c)])),
    stuckParts: majorsOf(s).filter((id) => s.present.has(id)),
  };
}
