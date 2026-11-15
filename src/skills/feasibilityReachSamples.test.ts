import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../utils/seededRandom';
import { tipOf } from './feasibilityChecks';
import { bodyPoint, chainOf, closeKin, norm, openKin, refresh, sub, type Kin, type V3 } from './feasibilityKinematics';
import { bestReachSamples } from './feasibilityReachSamples';
import { fixtureModel } from './fixtureModels';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const RELAX = { effortScale: 1, rangeDeg: 0, linkScale: 1 };

type SampleOptions = Parameters<typeof bestReachSamples>[1];

function allSamples(kin: Kin, { joints, tip, target }: SampleOptions) {
  const random = seededRandom('5eedc0de5eedc0de5eedc0de5eedc0de');
  const samples: Array<{ gap: number; q: number[] }> = [];

  for (let i = 0; i < 2048; i++) {
    for (const j of joints) {
      const [lo, hi] = j.range ?? [-Math.PI, Math.PI];

      kin.data.qpos[j.qpos] = lo + (hi - lo) * random();
    }

    refresh(kin);
    samples.push({
      gap: norm(sub(target, bodyPoint(kin, tip.body, tip.local))),
      q: joints.map((j) => kin.data.qpos[j.qpos]),
    });
  }

  return samples.sort((a, b) => a.gap - b.gap).slice(0, 6);
}

function compareSamples(kin: Kin, options: SampleOptions) {
  const source = structuredClone(options);
  const expected = allSamples(kin, options);
  const finalPose = Array.from(kin.data.qpos);
  const actual = bestReachSamples(kin, options);

  expect(actual.map((sample) => ({ gap: sample.gap, q: Array.from(sample.q) }))).toEqual(expected);
  expect(Array.from(kin.data.qpos)).toEqual(finalPose);
  expect(options).toEqual(source);
  expect(new Set(actual.map((sample) => sample.q)).size).toBe(6);

  return actual;
}

describe('reach refinement samples', () => {
  it.each(['arm-3dof', 'arm-6dof'])('matches full sorting across targets and range edits on %s', (id) => {
    const kin = openKin(mj, fixtureModel(id), { relax: RELAX });

    try {
      const tip = tipOf(kin, kin.joints.at(-1)!.id);
      const joints = chainOf(kin, tip.body);
      const targets: V3[] = [
        [0, 0.3, 0.15],
        [0.1, -0.05, 0.2],
        [-0.2, 0.1, 0.05],
      ];

      for (const target of targets) compareSamples(kin, { joints, tip, target });

      joints[0].range = null;
      joints[1].range = [-0.1, 0.1];

      const retained = compareSamples(kin, { joints, tip, target: targets[0] });
      const snapshot = retained.map((sample) => Array.from(sample.q));

      compareSamples(kin, { joints, tip, target: targets[1] });
      expect(retained.map((sample) => Array.from(sample.q))).toEqual(snapshot);
    } finally {
      closeKin(kin);
    }
  });

  it('keeps the first six tied trials, including an empty joint chain', () => {
    const kin = openKin(mj, fixtureModel('arm-3dof'), { relax: RELAX });
    const tip = { body: kin.root, local: [0, 0, 0] as V3 };

    try {
      const samples = compareSamples(kin, { joints: kin.joints, tip, target: [0, 0, 0] });

      expect(new Set(samples.map((sample) => sample.gap)).size).toBe(1);
      compareSamples(kin, { joints: [], tip, target: [0, 0, 0] });
    } finally {
      closeKin(kin);
    }
  });

  it.each(['arm-3dof', 'arm-6dof'])('allocates only six pose buffers across 2048 trials on %s', (id) => {
    const kin = openKin(mj, fixtureModel(id), { relax: RELAX });
    const tip = tipOf(kin, kin.joints.at(-1)!.id);
    const joints = chainOf(kin, tip.body);
    let allocatedValues = 0;
    const Float64 = globalThis.Float64Array;
    const tracked = new Proxy(Float64, {
      construct(target, args) {
        if (args.length === 1 && typeof args[0] === 'number') allocatedValues += args[0];

        return Reflect.construct(target, args);
      },
    });

    vi.stubGlobal('Float64Array', tracked);

    try {
      const samples = bestReachSamples(kin, { joints, tip, target: [0.1, 0.2, 0.3] });

      expect(samples).toHaveLength(6);
      expect(allocatedValues).toBe(6 * joints.length);
      expect(samples.every((sample) => sample.q.length === joints.length)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      closeKin(kin);
    }
  });
});
