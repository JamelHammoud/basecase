import type { AssemblyGeometry } from './assemblyGeometry';
import { AXES } from './moveBlockers';
import { clampingScrews, indexFasteners, type FastenerIndex } from './fastenerIndex';
import type { RemovalPlan, RemovalStep } from './removalOrder';
import { minimalClosures } from './minimalClosures';

type Closure = Set<number>;

interface Search {
  geometry: AssemblyGeometry;
  plan: RemovalPlan;
  owner: Map<string, number>;
  tracked: Set<string>;
  target: string;
  memo: Map<number, Closure[]>;
  fasteners: FastenerIndex;
}

function prerequisites(s: Search, step: RemovalStep): string[][] {
  const g = s.geometry;
  const majors = step.ids.filter((id) => g.moves[id]);
  const inside = new Set(step.ids);
  const screws = clampingScrews(s.fasteners, majors);
  const pins = screws.filter((c) => !inside.has(c.id)).map((c) => c.id);

  if (step.kind === 'screw') return (g.drivers[step.ids[0]] ?? []).map((option) => option.blockers);

  if (step.kind === 'unit') {
    return AXES.flatMap((_, k) =>
      majors.every((id) => !!g.moves[id].local[k]) ? [[...pins, ...majors.flatMap((id) => g.moves[id].local[k])]] : [],
    );
  }

  const move = g.moves[majors[0]];

  if (!move) return [];

  const ways = inside.has(s.target) ? move.exit : move.local;

  return (ways ?? []).map((way) => [...pins, ...way]);
}

function dependencies(s: Search, index: number, blockers: string[]): number[] | null {
  const inside = new Set(s.plan.steps[index].ids);
  const outside = blockers.filter((id) => s.tracked.has(id) && !inside.has(id));
  const owners = outside.map((id) => s.owner.get(id));

  if (owners.some((owner) => owner === undefined || owner >= index)) return null;

  return [...new Set(owners as number[])];
}

function combine(s: Search, index: number, ids: number[]): Closure[] {
  let choices: Closure[] = [new Set([index])];

  for (const id of ids) {
    const options = closures(s, id);

    choices = minimalClosures(choices.flatMap((choice) => options.map((option) => new Set([...choice, ...option]))));
  }

  return choices;
}

function closures(s: Search, index: number): Closure[] {
  const saved = s.memo.get(index);

  if (saved) return saved;

  const options = prerequisites(s, s.plan.steps[index]);
  const candidates = options.flatMap((way) => {
    const ids = dependencies(s, index, way);

    return ids ? combine(s, index, ids) : [];
  });
  const result = minimalClosures(candidates);

  s.memo.set(index, result);

  return result;
}

export function minimumTeardown(g: AssemblyGeometry, plan: RemovalPlan, target: string): Set<string> | null {
  const owner = new Map(plan.steps.flatMap((step, i) => step.ids.map((id) => [id, i] as const)));
  const index = owner.get(target);

  if (g.timedOut || index === undefined || plan.stuckParts.includes(target)) return null;

  const step = plan.steps[index];

  if (step.kind === 'unit' || (!g.moves[target] && !g.drivers[target])) return null;

  const tracked = new Set([
    ...Object.keys(g.moves),
    ...g.chains.screws.map((c) => c.id),
    ...g.chains.sleeves.map((sleeve) => sleeve.id),
  ]);
  const choices = closures(
    { geometry: g, plan, owner, tracked, target, memo: new Map(), fasteners: indexFasteners(g.chains.screws) },
    index,
  );
  const count = (choice: Closure) => [...choice].reduce((total, i) => total + plan.steps[i].ids.length, 0);
  const best = choices.reduce<Closure | null>(
    (before, next) => (!before || count(next) < count(before) ? next : before),
    null,
  );

  return best ? new Set(plan.steps.flatMap((removal, i) => (best.has(i) ? removal.ids : []))) : null;
}
