import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { editParts, fixtureModel, fixtureRobot, modelOf } from './fixtureModels';
import { validateEnvironment } from './environment';
import { kitJob } from './kitJob';
import { footCount, kitTopSpeed, rootHeight } from './kitModel';
import { kitEntries, kitEnvironment, kitSkillName, kitStatus, trainKitEntry } from './motorKit';
import { robustnessReward } from './raceRobustness';

describe('Motor Kit environments', () => {
  it('count feet and pick a top speed by legs', () => {
    expect(footCount(fixtureModel('quad-servo'))).toBe(4);
    expect(footCount(fixtureModel('hexapod'))).toBe(6);
    expect(footCount(fixtureModel('biped-servo'))).toBe(2);
    expect(kitTopSpeed(fixtureModel('quad-servo'))).toBeCloseTo(0.2, 9);
    expect(kitTopSpeed(fixtureModel('biped-servo'))).toBeCloseTo(0.15, 9);
  });

  it('read the start height from the model, as the engine places the root', async () => {
    const mj = await loadMujoco();
    const { SimEngine } = await import('../sim/engine');
    const model = fixtureModel('quad-servo');
    const engine = new SimEngine(mj, model);
    const root = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, model.robots[0].root);

    expect(rootHeight(model)).toBeCloseTo(engine.data.xpos[root * 3 + 2], 9);
    engine.dispose();
  });

  it('are valid, pure and blind to colour', async () => {
    const quad = fixtureRobot('quad-servo');
    const red = modelOf(editParts(quad, (p) => ({ ...p, color: '#ff0000' })));

    for (const entry of kitEntries(modelOf(quad))) {
      const environment = kitEnvironment(modelOf(quad), entry);

      expect(await validateEnvironment(environment, modelOf(quad))).toEqual([]);
      expect(kitEnvironment(red, entry)).toEqual(environment);
    }
  });

  it('apply only to legged robots', () => {
    expect(kitEntries(fixtureModel('arm-3dof'))).toEqual([]);
    expect(kitEntries(fixtureModel('rover-diff'))).toEqual([]);
    expect(kitStatus({ design: 'arm-3dof', model: fixtureModel('arm-3dof'), skills: [] })).toEqual([]);
    expect(kitSkillName('velocity-tracking')).toBe('Velocity tracking');
  });

  it('train velocity on resampled commands with the actor blind to linear velocity', () => {
    const job = kitJob(fixtureModel('quad-servo'), 'velocity-tracking', { minutes: 1, seed: 1 });

    expect(job.command).toEqual([0.2, 0, 0]);
    expect(job).toMatchObject({ actorLinvel: false, task: 'walk', squash: 'tanh', logStdMin: -2.5 });
    expect(kitJob(fixtureModel('biped-servo'), 'velocity-tracking', { minutes: 1, seed: 1 })).toMatchObject({
      squash: 'tanh',
      logStdMin: -2.5,
    });
    expect(job.delaySteps?.[1]).toBeGreaterThan(0);
    expect(job.reward).toContain('def reward(state):');
  });

  it('scale velocity actions per joint to the margin from neutral to the nearer limit', () => {
    const quad = fixtureModel('quad-servo');
    const scale = kitJob(quad, 'velocity-tracking', { minutes: 1, seed: 1 }).actionScale as number[];

    expect(scale.slice(0, 3).map((v) => +v.toFixed(3))).toEqual([0.698, 1.571, 2.269]);
    expect(kitEnvironment(quad, 'velocity-tracking').action.scale).toEqual(scale);
    expect(kitJob(quad, 'stand', { minutes: 1, seed: 1 }).actionScale).toBe(0.5);
  });
});

describe('Motor Kit training', () => {
  it('refuses the weak quad before any training', async () => {
    const mj = await loadMujoco();
    const runs: string[] = [];
    const outcome = await trainKitEntry({
      mj,
      design: 'must-fail-weak-quad',
      model: fixtureModel('must-fail-weak-quad'),
      entry: 'stand',
      forge: (job) => {
        runs.push(job.name);

        return Promise.reject(new Error('no training'));
      },
      save: () => Promise.reject(new Error('no saving')),
    });

    expect(outcome.kind).toBe('refused');
    expect(outcome.kind === 'refused' && outcome.relaxation?.change).toBe('torque-x2');
    expect(runs).toEqual([]);
  });
});

describe('the contract-robustness reward', () => {
  it('lowers a velocity contract to per-tick terms', () => {
    const source = robustnessReward(kitEnvironment(fixtureModel('quad-servo'), 'velocity-tracking'));

    expect(source).toContain('state.linvel[1]');
    expect(source).toContain('state.gravity[2]');
  });

  it('refuses contracts over signals it can’t read per tick', () => {
    expect(robustnessReward(kitEnvironment(fixtureModel('quad-servo'), 'settle-to-neutral'))).toBeNull();
  });
});
