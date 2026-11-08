import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentDesign, modelHashes, skillFromTraining, type ArenaEvidence, type Skill } from './artifacts';
import { editParts, fixtureRobot, modelOf } from './fixtureModels';
import { backgroundTasks, Debounce, designMoved } from './kitPlan';
import { kitEnvironment } from './motorKit';
import { skillRecord } from './skillRecords';
import { skillRows } from './skillRows';
import type { SimModel } from '../sim/mjcfTypes';

const DESIGN = 'quad';
const quad = fixtureRobot('quad-servo');
const base = modelOf(quad);

function passing(skill: Skill): ArenaEvidence {
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
    variants: [{ variant: 'held-out', trials: 32, passes: 32, lowerBound: 0.91, diverged: 0, failures: {} }],
    lowerBound: 0.91,
    passed: true,
    conditions: [],
    summary: '',
    saltCommitment: 'f'.repeat(64),
  };
}

const standRecord = () => {
  const environment = kitEnvironment(base, 'stand');
  const draft = skillFromTraining({
    name: 'Stand',
    start: null,
    current: currentDesign({ design: DESIGN, model: base, environment }),
    environment,
    controller: { kind: 'hold' },
  });

  return skillRecord({ ...draft, evidence: passing(draft) }, { kit: 'stand' });
};

const tasksOn = (model: SimModel) =>
  backgroundTasks(skillRows({ model, design: DESIGN, records: [standRecord()], jobs: [] })).map((t) => [
    t.entry,
    t.kind,
  ]);

describe('Kit retraining after CAD edits', () => {
  it('ignores visual edits and wakes on joints, masses or sizes', () => {
    const red = modelOf(editParts(quad, (p) => ({ ...p, color: '#ff0000', name: `${p.name} red` })));
    const heavy = modelOf(editParts(quad, (p) => ({ ...p, massG: (p.massG ?? 40) * 2 })));
    const longer = modelOf(
      editParts(quad, (p) => ({ ...p, dimensions: { ...p.dimensions, height: p.dimensions.height * 1.2 } })),
    );

    expect(designMoved(modelHashes(base), modelHashes(red))).toBe(false);
    expect(designMoved(modelHashes(base), modelHashes(heavy))).toBe(true);
    expect(designMoved(modelHashes(base), modelHashes(longer))).toBe(true);
    expect(designMoved(null, modelHashes(base))).toBe(false);
  });

  it('rechecks a Kit skill in Arena after a mass edit and retrains it after a joint edit', () => {
    const heavy = modelOf(editParts(quad, (p) => ({ ...p, massG: (p.massG ?? 40) * 2 })));
    const fewer = modelOf({ ...quad, joints: quad.joints.slice(1) });

    expect(tasksOn(base)).toEqual([]);
    expect(tasksOn(heavy)).toEqual([['stand', 'recheck']]);
    expect(tasksOn(fewer)).toEqual([['stand', 'train']]);
  });

  it('never starts an entry nobody trained', () => {
    expect(backgroundTasks(skillRows({ model: base, design: DESIGN, records: [], jobs: [] }))).toEqual([]);
  });
});

describe('the debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs only the latest of a burst', () => {
    const debounce = new Debounce(1000);
    const ran: number[] = [];

    for (const n of [1, 2, 3]) {
      debounce.run(() => ran.push(n));
      vi.advanceTimersByTime(400);
    }

    expect(ran).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(ran).toEqual([3]);

    debounce.run(() => ran.push(4));
    debounce.cancel();
    vi.advanceTimersByTime(2000);
    expect(ran).toEqual([3]);
  });
});
