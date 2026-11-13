import type { Handoff, RoutineError, SkillContract, TransitionProof } from './schema';

export type HandoffProofs = Record<string, TransitionProof>;

export interface RefusedHandoff extends Handoff {
  falls: number | null;
  node: string | null;
}

export const handoffKey = (h: Handoff) => `${h.from}->${h.to}`;

export function withHandoffs(skills: readonly SkillContract[], proofs: HandoffProofs | undefined): SkillContract[] {
  const entries = Object.entries(proofs ?? {}).map(([key, proof]) => ({ pair: key.split('->'), proof }));

  if (!entries.length) return [...skills];

  return skills.map((skill) => {
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
