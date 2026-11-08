import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { ARENA, runArena } from './arena';
import { arenaSummary, binomialTailAtLeast, clopperPearsonLower } from './arenaStats';
import { drawInstance, seededRandom, trialSeed } from './arenaWorld';
import type { Contract } from './contract';
import { policyObservation, type Environment } from './environment';
import { fixtureModel } from './fixtureModels';

const arm = fixtureModel('arm-3dof');
const staysPut: Contract = {
  version: 1,
  success: {
    always: {
      window: 'whole',
      state: { atom: { expr: { abs: { delta: { signal: 'elbow' } } }, cmp: '<', value: 0.15, scale: 0.15 } },
    },
  },
  failures: [],
};

function armEnvironment(contract: Contract = staysPut): Environment {
  return {
    version: 1,
    robot: arm.robots[0].key,
    horizonS: 0.6,
    traceDt: 0.02,
    observation: policyObservation(['arm0', 'arm1', 'arm2']),
    action: { kind: 'position-offset', joints: ['arm0', 'arm1', 'arm2'], scale: 0.25, controlDt: 0.02 },
    reset: { pose: { values: { arm1: 60 } }, jointNoiseDeg: 2, baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: { friction: [1, 1], mass: [1, 1], strength: [1, 1], latencyMs: [0, 0] },
    reward: { kind: 'contract-robustness' },
    contract,
    signals: { elbow: { kind: 'joint-position', joint: 'arm1' } },
  };
}

const salt = new Uint8Array(32).fill(7);
const bent = { kind: 'hold' as const, values: { arm1: 60 } };

describe('Clopper-Pearson', () => {
  it('matches known one-sided 95% lower bounds', () => {
    expect(clopperPearsonLower(32, 32, 0.95)).toBeCloseTo(0.05 ** (1 / 32), 6);
    expect(clopperPearsonLower(8, 10, 0.95)).toBeCloseTo(0.4931, 3);
    expect(clopperPearsonLower(0, 32, 0.95)).toBe(0);
    expect(binomialTailAtLeast(5, 10, 0.5)).toBeCloseTo(0.623, 3);
  });

  it('needs about 29 of 32 to clear the bar', () => {
    expect(clopperPearsonLower(29, 32, ARENA.confidence)).toBeGreaterThanOrEqual(ARENA.bar);
    expect(clopperPearsonLower(28, 32, ARENA.confidence)).toBeLessThan(ARENA.bar);
  });

  it('says how many tries passed and the pass rate it supports', () => {
    const text = arenaSummary({
      variants: [{ variant: 'held-out', trials: 32, passes: 31, lowerBound: 0.86, diverged: 0, failures: {} }],
      lowerBound: 0.86,
      confidence: 0.95,
    });

    expect(text).toContain('31 of 32');
    expect(text).toContain('at least 86%');
  });
});

describe('sealed seeds', () => {
  it('draw different instances under different salts and the same ones under the same salt', () => {
    const ranges = {
      friction: [0.5, 1.5] as [number, number],
      mass: [0.5, 1.5] as [number, number],
      strength: [0.5, 1] as [number, number],
      latencyMs: [0, 40] as [number, number],
      jointNoiseDeg: 3,
      baseYawDeg: 10,
      baseOffsetMm: 5,
    };
    const draw = (s: Uint8Array) =>
      drawInstance(seededRandom(trialSeed({ salt: s, variant: 'held-out', trial: 3, environment: 'e' })), {
        ranges,
        bodies: 4,
        joints: 3,
      });

    expect(draw(salt)).toEqual(draw(salt));
    expect(draw(new Uint8Array(32).fill(8)).friction).not.toBe(draw(salt).friction);
  });
});

describe('Arena on real WASM MuJoCo', () => {
  it('passes a held arm, fails a limp one, and keeps instance values out of the evidence', async () => {
    const mj = await loadMujoco();
    const env = armEnvironment();
    const held = await runArena({
      mj,
      model: arm,
      contract: staysPut,
      controller: bent,
      environment: env,
      salt,
    });
    const limp = await runArena({
      mj,
      model: arm,
      contract: staysPut,
      controller: { kind: 'limp' },
      environment: env,
      salt,
    });

    expect(held.passed).toBe(true);
    expect(held.variants.map((v) => v.trials)).toEqual([32, 32, 32]);
    expect(held.variants.map((v) => v.variant)).toEqual(['held-out', 'half-timestep', 'latency']);
    expect(limp.passed).toBe(false);
    expect(limp.lowerBound).toBeLessThan(ARENA.bar);
    expect(held.summary).toContain('32 of 32');
    expect(held.conditions.join(' ')).toContain('×0.8 to ×1.2');
    expect(Object.keys(held).sort()).toEqual(
      [
        'arenaVersion',
        'bar',
        'binding',
        'conditions',
        'confidence',
        'lowerBound',
        'passed',
        'saltCommitment',
        'summary',
        'variants',
      ].sort(),
    );
    expect(JSON.stringify(held)).not.toContain(Array.from(salt).join(','));
  }, 30_000);

  it('refuses a contract the environment does not carry', async () => {
    const mj = await loadMujoco();
    const other: Contract = { ...staysPut, failures: [{ label: 'x', formula: staysPut.success }] };

    await expect(
      runArena({ mj, model: arm, contract: other, controller: { kind: 'hold' }, environment: armEnvironment(), salt }),
    ).rejects.toThrow(/differ/);
  });

  it('refuses an environment that reads a joint the robot lacks', async () => {
    const mj = await loadMujoco();
    const env = { ...armEnvironment(), signals: { elbow: { kind: 'joint-position' as const, joint: 'knee' } } };

    await expect(
      runArena({ mj, model: arm, contract: staysPut, controller: { kind: 'hold' }, environment: env, salt }),
    ).rejects.toThrow(/missing joint/);
  });
});
