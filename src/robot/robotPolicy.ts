import { useEffect, useEffectEvent } from 'react';
import type { SkillRow } from '../skills/skillRows';
import type { PolicyRecord } from '../types/robotics';
import { setRobotPolicy } from './robotStore';

export type RobotPolicyRef = { kind: 'policy'; id: string } | { kind: 'skill'; hash: string };

interface TrainedSources {
  policies: readonly PolicyRecord[] | undefined;
  isStale: (record: PolicyRecord) => boolean;
  skillRows: readonly SkillRow[];
}

interface Candidate {
  at: string;
  ref: RobotPolicyRef;
}

export const MAX_POLICY_CANDIDATES = 16;

export function readyRobotPolicies({ policies, isStale, skillRows }: TrainedSources): RobotPolicyRef[] {
  const fresh = (policies ?? [])
    .filter((record) => !isStale(record))
    .map((record): Candidate => ({ at: record.createdAt, ref: { kind: 'policy', id: record.id } }));
  const ready = skillRows.flatMap((row): Candidate[] =>
    row.state.kind === 'ready' && row.record
      ? [{ at: row.record.createdAt, ref: { kind: 'skill', hash: row.record.hash } }]
      : [],
  );

  return [...fresh, ...ready]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_POLICY_CANDIDATES)
    .map((c) => c.ref);
}

const refKey = (ref: RobotPolicyRef) => `${ref.kind}:${ref.kind === 'policy' ? ref.id : ref.hash}`;

export function useRobotPolicy({ active, ...sources }: TrainedSources & { active: boolean }) {
  const refs = readyRobotPolicies(sources);
  const key = refs.map(refKey).join();
  const send = useEffectEvent(() => setRobotPolicy(refs));

  useEffect(() => {
    if (active) send();
  }, [active, key]);
}
