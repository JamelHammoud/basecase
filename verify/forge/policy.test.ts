import fs from 'node:fs';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { SimEngine } from '../../src/sim/engine';
import { act, isPolicySpec, obsSize, type PolicySpec } from '../../src/sim/policy';

const FOLDER = path.resolve('verify/out/forge/f1-speed');
const FIXTURE = path.resolve('verify/out/fixtures/quad-servo');
const spec = () => JSON.parse(fs.readFileSync(path.join(FOLDER, 'policy.json'), 'utf8')) as PolicySpec;

describe('a Forge policy in the app', () => {
  it('is a valid policy spec', () => {
    expect(isPolicySpec(spec())).toBe(true);
  });

  it('gives the same actions in the app as in Forge', () => {
    const check = JSON.parse(fs.readFileSync(path.join(FOLDER, 'policy-check.json'), 'utf8')) as {
      samples: Array<{ obs: number[]; action: number[] }>;
    };

    expect(check.samples.length).toBeGreaterThanOrEqual(8);

    for (const s of check.samples) {
      const a = act(spec(), Float32Array.from(s.obs));

      a.forEach((v, i) => expect(Math.abs(v - s.action[i])).toBeLessThan(1e-3));
    }
  });

  it('runs in the live simulator on the same model', async () => {
    const mj = await loadMujoco();
    const sim = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'sim.json'), 'utf8'));
    const engine = new SimEngine(mj, sim);
    const policy = spec();

    expect(policy.obsMean).toHaveLength(obsSize(policy.joints.length));
    engine.setController({ kind: 'policy', policy, robot: sim.robots[0].key });
    engine.step(1);

    const finite = Array.from(engine.data.qpos as Float64Array).every(Number.isFinite);

    engine.dispose();
    expect(finite).toBe(true);
  });
});
