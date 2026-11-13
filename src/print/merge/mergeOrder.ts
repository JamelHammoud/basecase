import type { AssemblyGeometry, PartMoves } from '../../assembly/assemblyGeometry';
import { AXES } from '../../assembly/moveBlockers';
import { planRemoval, type RemovalPlan } from '../../assembly/removalOrder';
import type { LeftOutReason } from './mergeTypes';

export interface MergeOrderInput {
  members: Set<string>;
  keep: string;
  dropped: Set<string>;
  groups: Record<string, string | undefined>;
  roles: Record<string, string>;
}

type Rename = (ids: string[]) => string[];

function renamer({ members, keep, dropped }: MergeOrderInput): Rename {
  return (ids) => [...new Set(ids.filter((id) => !dropped.has(id)).map((id) => (members.has(id) ? keep : id)))];
}

function mergedMoves(g: AssemblyGeometry, input: MergeOrderInput, rename: Rename): Record<string, PartMoves> {
  const others = Object.entries(g.moves).filter(([id]) => !input.members.has(id));
  const own = [...input.members].filter((id) => g.moves[id]).map((id) => g.moves[id]);
  const local = AXES.map((_, k) => rename(own.flatMap((m) => m.local[k] ?? [])).filter((id) => id !== input.keep));
  const moves: Record<string, PartMoves> = Object.fromEntries(
    others.map(([id, m]) => [id, { ...m, local: m.local.map(rename), lips: m.lips.map(rename) }]),
  );

  moves[input.keep] = { dirs: AXES, local, lips: AXES.map(() => []), exit: null, captured: false, contents: [] };

  return moves;
}

export function mergedGeometry(g: AssemblyGeometry, input: MergeOrderInput): AssemblyGeometry {
  const rename = renamer(input);
  const one = (id: string | null | undefined) => (id && input.members.has(id) ? input.keep : id);
  const screws = g.chains.screws
    .filter((c) => !input.dropped.has(c.id))
    .map((c) => ({ ...c, stack: rename(c.stack), endsIn: { ...c.endsIn, id: one(c.endsIn.id) ?? undefined } }));
  const sleeves = g.chains.sleeves
    .filter((s) => !input.dropped.has(s.id))
    .map((s) => ({ ...s, host: one(s.host) ?? null }));
  const drivers = Object.fromEntries(
    Object.entries(g.drivers)
      .filter(([id]) => !input.dropped.has(id))
      .map(([id, options]) => [id, options.map((o) => ({ ...o, blockers: rename(o.blockers) }))]),
  );

  return {
    ...g,
    chains: {
      screws,
      sleeves,
      setScrews: g.chains.setScrews?.map((s) => ({ ...s, touching: rename(s.touching) })),
    },
    moves: mergedMoves(g, input, rename),
    drivers,
    splits: {},
  };
}

const soloParts = (plan: RemovalPlan) => new Set(plan.steps.filter((s) => s.kind === 'part').flatMap((s) => s.ids));

function sealed(before: RemovalPlan, after: RemovalPlan, input: MergeOrderInput): string[] {
  const solo = soloParts(before);
  const withKeep = after.steps.filter((s) => s.kind === 'unit' && s.ids.includes(input.keep)).flatMap((s) => s.ids);

  return withKeep.filter((id) => id !== input.keep && solo.has(id) && !input.dropped.has(id));
}

const stuckScrews = (plan: RemovalPlan) =>
  Object.entries(plan.screws)
    .filter(([, v]) => v.verdict === 'stuck')
    .map(([id]) => id);

const componentsFirst = (roles: Record<string, string>) => (a: string, b: string) =>
  Number(roles[b] === 'component') - Number(roles[a] === 'component') || a.localeCompare(b);

export function orderProblem(g: AssemblyGeometry, before: RemovalPlan, input: MergeOrderInput): LeftOutReason | null {
  const rename = renamer(input);
  const after = planRemoval(mergedGeometry(g, input), input.groups);
  const seal = sealed(before, after, input).sort(componentsFirst(input.roles));

  if (seal.length) return { code: 'seals', part: seal[0] };

  const stuckBefore = new Set(rename([...before.stuckParts, ...stuckScrews(before)]));
  const stuck = [...after.stuckParts, ...stuckScrews(after)].filter((id) => !stuckBefore.has(id));

  return stuck.length ? { code: 'stuck', part: stuck.sort(componentsFirst(input.roles))[0] } : null;
}
