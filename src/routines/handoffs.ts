import type { Handoff, RoutineError, SkillContract, TransitionProof } from './schema';
import { pairStamp, type StampScene } from './skillStamps';

export type HandoffProofs = Record<string, TransitionProof>;

export interface RefusedHandoff extends Handoff {
  falls: number | null;
  node: string | null;
}

export const handoffKey = (h: Handoff) => `${h.from}->${h.to}`;

export interface HandoffKit {
  skills: readonly SkillContract[];
  policies: StampScene['skills'];
  drive: StampScene['drive'];
}

export function withHandoffs(kit: HandoffKit, proofs: HandoffProofs | undefined): SkillContract[] {
  const scene = { skills: kit.policies, drive: kit.drive };
  const entries = Object.entries(proofs ?? {})
    .map(([key, proof]) => ({ pair: key.split('->'), proof }))
    .filter(({ pair: [from, to], proof }) => to !== undefined && proof.skills === pairStamp(scene, { from, to }));

  if (!entries.length) return [...kit.skills];

  return kit.skills.map((skill) => {
    const own = entries.filter((e) => e.pair.length === 2 && e.pair[0] === skill.id);

    if (!own.length) return skill;

    return {
      ...skill,
      transitions: { ...skill.transitions, ...Object.fromEntries(own.map((e) => [e.pair[1], e.proof])) },
    };
  });
}

export function refusedHandoffs(errors: readonly RoutineError[]): RefusedHandoff[] {
  const seen = new Map<string, RefusedHandoff>();

  for (const e of errors) {
    if (e.code !== 'unproven-transition' || !e.handoff) continue;

    const key = handoffKey(e.handoff);

    if (!seen.has(key)) seen.set(key, { ...e.handoff, node: e.path ?? null });
  }

  return [...seen.values()];
}

export const nodeHandoff = (errors: readonly RoutineError[], node: string): RefusedHandoff | null =>
  refusedHandoffs(errors.filter((e) => e.path === node))[0] ?? null;
