import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureModel, fixtureRobot, modelOf } from '../../src/skills/fixtureModels';
import { kitStatus, trainKitEntry } from '../../src/skills/motorKit';
import { runSolverRace } from '../../src/skills/race';
import { forgeRunner } from './forge';
import { KIT_OUT, loadKitSkill, skillStore } from './plans';
import { HACKED_REWARD, walkTask } from './raceTasks';
import { driveBiped, STEERING_TIMELINE, steeringProblems, STRAIGHT_ONLY } from './steering';

const CANARY_OUT = path.join(path.dirname(KIT_OUT), 'canary');

function setUp(ready: boolean, why: string) {
  if (!ready) throw new Error(`The planted fault wasn't set up: ${why}`);
}

describe('Stage 3a canaries: each plants a fault the gate must catch', () => {
  it('canary hacked: a reward-hacked candidate wins the race', async () => {
    const mj = await loadMujoco();
    const dir = path.join(CANARY_OUT, 'hacked');
    const forge = forgeRunner(path.join(dir, 'runs'));
    const store = skillStore(path.join(dir, 'store'));
    const outcome = await runSolverRace({
      mj,
      task: walkTask(mj),
      forge: forge.run,
      save: store.save,
      rewardCandidates: [HACKED_REWARD],
      robustnessCandidate: false,
      budgetSteps: 10_000_000,
    });
    const candidates = outcome.attempts.flatMap((a) => a.candidates);
    const trained = candidates.some((c) => c.reward.kind === 'rewardlang' && c.steps > 0);

    setUp(trained && forge.records.length > 0, 'the race never trained the hacked candidate');
    expect(outcome.kind).toBe('skill');
  }, 3_600_000);

  it('canary weak: must-fail-weak-quad gets a Stand skill', async () => {
    const mj = await loadMujoco();
    const dir = path.join(CANARY_OUT, 'weak');
    const forge = forgeRunner(path.join(dir, 'runs'));
    const store = skillStore(path.join(dir, 'store'));
    const outcome = await trainKitEntry({
      mj,
      design: 'must-fail-weak-quad',
      model: fixtureModel('must-fail-weak-quad'),
      entry: 'stand',
      forge: forge.run,
      save: store.save,
    });

    expect(outcome.kind).toBe('skill');
  }, 1_800_000);

  it('canary transfer: a quad-servo Stand skill is fresh on the hexapod', () => {
    const { skill } = loadKitSkill('quad-servo', 'stand');
    const home = kitStatus({ design: 'quad-servo', model: modelOf(fixtureRobot('quad-servo')), skills: [skill] });

    setUp(home.find((r) => r.entry === 'stand')?.freshness === 'fresh', 'the skill is not fresh on its own robot');

    const rows = kitStatus({ design: 'hexapod', model: modelOf(fixtureRobot('hexapod')), skills: [skill] });

    expect(rows.find((r) => r.entry === 'stand')?.freshness).toBe('fresh');
  });

  it('canary straight: a biped that only walks straight passes steering', async () => {
    const { samples, startHeight: height } = await driveBiped(STRAIGHT_ONLY);
    const problems = steeringProblems(samples, { wanted: STEERING_TIMELINE, startHeight: height });

    setUp(!problems.some((p) => /^(fell|pushed|forward)/.test(p)), problems.join('; '));
    expect(problems.filter((p) => p.startsWith('turn'))).toEqual([]);
  }, 300_000);
});
