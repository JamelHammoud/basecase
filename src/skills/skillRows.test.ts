import { describe, expect, it } from 'vitest';
import { currentDesign, skillFromTraining, type ArenaEvidence, type Skill } from './artifacts';
import { editParts, fixtureModel, fixtureRobot, modelOf } from './fixtureModels';
import type { TrainedEntry } from './kitEnvironment';
import { kitEnvironment } from './motorKit';
import { arenaLine, moveTag, skillRecord, type SkillRecord } from './skillRecords';
import { readyVelocity, readyWalkRecord, skillRows, type SkillJob } from './skillRows';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import { moveEnvironment } from './moveEnvironment';
import { quadSit } from './moveFixtures';

const DESIGN = 'quad';

function evidence(skill: Skill, passes: number[]): ArenaEvidence {
  const variants = (['held-out', 'half-timestep', 'latency'] as const).map((variant, i) => ({
    variant,
    trials: 32,
    passes: passes[i],
    lowerBound: passes[i] / 40,
    diverged: 0,
    failures: {},
  }));
  const lowerBound = Math.min(...variants.map((v) => v.lowerBound));

  return {
    arenaVersion: 1,
    binding: {
      contract: skill.binding.contract,
      physics: skill.binding.physics,
      actuators: skill.binding.actuators,
      environment: 'e'.repeat(64),
    },
    confidence: 0.95,
    bar: 0.75,
    variants,
    lowerBound,
    passed: lowerBound >= 0.75,
    conditions: [],
    summary: '',
    saltCommitment: 'f'.repeat(64),
  };
}

function kitRecord(model: SimModel, entry: TrainedEntry, passes = [32, 31, 32]): SkillRecord {
  const environment = kitEnvironment(model, entry);
  const draft = skillFromTraining({
    name: entry,
    start: null,
    current: currentDesign({ design: DESIGN, model, environment }),
    environment,
    controller: { kind: 'hold' },
  });

  return skillRecord({ ...draft, evidence: evidence(draft, passes) }, { kit: entry });
}

describe('the skills list', () => {
  const model = fixtureModel('quad-servo');

  it('lists the Motor Kit for a legged robot, every entry needing training at first', () => {
    const rows = skillRows({ model, design: DESIGN, records: [], jobs: [] });

    expect(rows.map((r) => r.label)).toEqual(['Stand', 'Walk', 'Get up', 'Settle']);
    expect(rows.every((r) => r.state.kind === 'untrained')).toBe(true);
    expect(rows.find((r) => r.label === 'Walk')?.drives).toBe(true);
  });

  it('lists no Kit for an arm, only what the user taught', () => {
    expect(skillRows({ model: fixtureModel('arm-3dof'), design: 'arm', records: [], jobs: [] })).toEqual([]);
  });

  it('shows a proved skill as ready with its worst Arena line', () => {
    const record = kitRecord(model, 'stand', [32, 31, 32]);
    const rows = skillRows({ model, design: DESIGN, records: [record], jobs: [] });
    const stand = rows.find((r) => r.kit === 'stand')!;

    expect(stand.state).toEqual({ kind: 'ready', arena: '31 of 32 tries, at least 77%' });
    expect(arenaLine(record.evidence!)).toBe('31 of 32 tries, at least 77%');
  });

  it('shows a job over the entry it trains, with its progress', () => {
    const job: SkillJob = {
      target: 'kit:velocity-tracking',
      label: 'Walk',
      share: 0.4,
      message: 'Training',
      background: true,
    };
    const walk = skillRows({ model, design: DESIGN, records: [], jobs: [job] }).find((r) => r.drives)!;

    expect(walk.state).toEqual({ kind: 'training', share: 0.4, message: 'Training', background: true, snapshot: null });
  });

  it('asks for a recheck after a mass edit and training after a joint edit', () => {
    const record = kitRecord(model, 'stand');
    const quad = fixtureRobot('quad-servo');
    const heavier = modelOf(editParts(quad, (p) => ({ ...p, massG: (p.massG ?? 50) * 1.5 })));
    const fewer = modelOf({ ...quad, joints: quad.joints.slice(1) });
    const state = (m: SimModel) =>
      skillRows({ model: m, design: DESIGN, records: [record], jobs: [] }).find((r) => r.kit === 'stand')?.state.kind;

    expect(state(heavier)).toBe('recheck');
    expect(state(fewer)).toBe('untrained');
  });

  it('lists taught skills by the words they were taught with, and a race still running', () => {
    const environment = kitEnvironment(model, 'stand');
    const draft = skillFromTraining({
      name: 'wave',
      start: null,
      current: currentDesign({ design: DESIGN, model, environment }),
      environment,
      controller: { kind: 'hold' },
    });
    const taught = skillRecord(
      { ...draft, evidence: evidence(draft, [32, 32, 32]) },
      { kit: null, goal: 'wave a front leg', environment },
    );
    const job: SkillJob = { target: 'goal:hop', label: 'hop', share: null, message: 'Racing', background: false };
    const rows = skillRows({ model, design: DESIGN, records: [taught], jobs: [job] });

    expect(rows.slice(4).map((r) => [r.label, r.state.kind])).toEqual([
      ['wave a front leg', 'ready'],
      ['hop', 'training'],
    ]);
  });

  it('finds the ready Walk to drive with', () => {
    const records = [kitRecord(model, 'velocity-tracking')];

    expect(readyVelocity(skillRows({ model, design: DESIGN, records, jobs: [] }))?.kit).toBe('velocity-tracking');
    expect(readyVelocity(skillRows({ model, design: DESIGN, records: [], jobs: [] }))).toBeNull();
  });

  it('picks the Walk Drive picks: an older fresh one over a newer one for another design', () => {
    const quad = fixtureRobot('quad-servo');
    const heavier = modelOf(editParts(quad, (p) => ({ ...p, massG: (p.massG ?? 50) * 1.5 })));
    const fresh = { ...kitRecord(model, 'velocity-tracking'), createdAt: '2026-11-01T00:00:00.000Z' };
    const failing = { ...kitRecord(model, 'velocity-tracking', [10, 10, 10]), createdAt: '2026-11-02T00:00:00.000Z' };
    const stale = { ...kitRecord(heavier, 'velocity-tracking'), createdAt: '2026-11-12T00:00:00.000Z' };
    const records = [fresh, stale];
    const drive = readyVelocity(skillRows({ model, design: DESIGN, records, jobs: [] }));

    expect(readyWalkRecord({ model, design: DESIGN, records })).toBe(fresh);
    expect(drive).toBe(fresh);
    expect(readyWalkRecord({ model, design: DESIGN, records: [...records, failing] })).toBe(
      readyVelocity(skillRows({ model, design: DESIGN, records: [...records, failing], jobs: [] })),
    );
    expect(readyWalkRecord({ model, design: DESIGN, records: [stale] })).toBeNull();
  });
});

describe('moves in the skills list', () => {
  const model = fixtureModel('quad-servo');
  const sit = quadSit();

  function moveRecord(animation: RobotAnimation): SkillRecord {
    const environment = moveEnvironment(model, animation);
    const draft = skillFromTraining({
      name: animation.name,
      start: null,
      current: currentDesign({ design: DESIGN, model, environment }),
      environment,
      controller: { kind: 'hold' },
    });

    return skillRecord(
      { ...draft, evidence: evidence(draft, [32, 31, 32]) },
      {
        kit: null,
        move: moveTag(animation.id, environment),
      },
    );
  }

  it('gives each animation of a legged robot a row named after it, untrained at first', () => {
    const rows = skillRows({ model, design: DESIGN, records: [], jobs: [], animations: [sit] });
    const row = rows.find((r) => r.target === 'move:sit');

    expect(row).toMatchObject({ label: 'Sit', kit: null, state: { kind: 'untrained' } });
    expect(row?.move?.id).toBe('sit');
  });

  it('is ready once a passing run is recorded, and goes back to Train when the animation changes', () => {
    const record = moveRecord(sit);
    const ready = skillRows({ model, design: DESIGN, records: [record], jobs: [], animations: [sit] });

    expect(ready.find((r) => r.move)?.state).toEqual({ kind: 'ready', arena: '31 of 32 tries, at least 77%' });
    expect(ready.filter((r) => !r.kit && !r.move)).toEqual([]);

    const deeper = { ...sit, keyframes: sit.keyframes.map((k, i) => (i ? { ...k, t: 0.6 } : k)) };
    const changed = skillRows({ model, design: DESIGN, records: [record], jobs: [], animations: [deeper] });

    expect(changed.find((r) => r.move)?.state.kind).not.toBe('ready');
  });
});
