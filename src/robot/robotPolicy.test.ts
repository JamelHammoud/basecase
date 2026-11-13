import { describe, expect, it } from 'vitest';
import { SIM_MODEL_VERSION } from '../sim/mjcfTypes';
import { isStalePolicy } from '../sim/policyFreshness';
import type { SkillRecord } from '../skills/skillRecords';
import type { SkillRow, SkillState } from '../skills/skillRows';
import type { PolicyRecord } from '../types/robotics';
import { MAX_POLICY_CANDIDATES, readyRobotPolicies } from './robotPolicy';

const policy = (id: string, createdAt: string, extra: Partial<PolicyRecord> = {}): PolicyRecord => ({
  id,
  name: id,
  task: 'walk',
  robot: 'robot-1',
  robotName: 'Quad',
  command: [0.3, 0, 0],
  trainedSteps: 1000,
  modelVersion: SIM_MODEL_VERSION,
  fingerprint: 'now',
  createdAt,
  ...extra,
});

const READY: SkillState = { kind: 'ready', arena: '31 of 32 tries, at least 77%' };

const skill = (hash: string, createdAt: string, state: SkillState = READY): SkillRow => ({
  target: 'kit:velocity-tracking',
  label: 'Walk',
  kit: 'velocity-tracking',
  move: null,
  record: { hash, createdAt } as SkillRecord,
  state,
  drives: true,
});

const isStale = (r: PolicyRecord) => isStalePolicy(r, { 'robot-1': 'now' });

describe('the policy sent to the robot', () => {
  it('lists the policies trained on the robot as it is now and the ready skills, newest first', () => {
    const policies = [
      policy('policy-a', '2026-11-01T00:00:00Z'),
      policy('policy-b', '2026-11-03T00:00:00Z'),
      policy('policy-c', '2026-11-05T00:00:00Z', { fingerprint: 'before' }),
      policy('policy-d', '2026-11-06T00:00:00Z', { modelVersion: 0 }),
    ];
    const rows = [
      skill('walk-old', '2026-11-02T00:00:00Z'),
      skill('walk-recheck', '2026-11-07T00:00:00Z', { kind: 'recheck' }),
    ];

    expect(
      readyRobotPolicies({ policies, isStale, skillRows: [...rows, skill('walk-new', '2026-11-04T00:00:00Z')] }),
    ).toEqual([
      { kind: 'skill', hash: 'walk-new' },
      { kind: 'policy', id: 'policy-b' },
      { kind: 'skill', hash: 'walk-old' },
      { kind: 'policy', id: 'policy-a' },
    ]);
  });

  it('is empty when every policy is stale and no skill is ready, and never longer than the cap', () => {
    const stale = [policy('policy-c', '2026-11-03T00:00:00Z', { fingerprint: 'before' })];
    const training = skill('walk', '2026-11-04T00:00:00Z', {
      kind: 'training',
      share: 0.5,
      message: '',
      background: false,
      snapshot: null,
    });

    const many = Array.from({ length: 40 }, (_, k) =>
      policy(`policy-${k}`, `2026-10-${String((k % 28) + 1).padStart(2, '0')}T00:00:00Z`),
    );

    expect(readyRobotPolicies({ policies: stale, isStale, skillRows: [training] })).toEqual([]);
    expect(readyRobotPolicies({ policies: undefined, isStale, skillRows: [] })).toEqual([]);
    expect(readyRobotPolicies({ policies: many, isStale, skillRows: [] })).toHaveLength(MAX_POLICY_CANDIDATES);
  });
});
