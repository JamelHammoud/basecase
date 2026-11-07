import fs from 'node:fs';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { compareWasm, REL_TOLERANCE, ROLLOUT_TOLERANCE, type Reference } from './compare';

const ROOT = path.resolve('verify/out/fixtures');
const robots = fs.readdirSync(ROOT).filter((n) => fs.existsSync(path.join(ROOT, n, 'reference.json')));
const load = (name: string) => ({
  xml: fs.readFileSync(path.join(ROOT, name, 'model.xml'), 'utf8'),
  ref: JSON.parse(fs.readFileSync(path.join(ROOT, name, 'reference.json'), 'utf8')) as Reference,
});

describe('WASM matches C MuJoCo on every fixture', () => {
  it('has fixtures to compare', () => {
    expect(robots.length).toBeGreaterThanOrEqual(12);
  });

  for (const name of robots) {
    it(name, async () => {
      const mj = await loadMujoco();
      const { xml, ref } = load(name);
      const r = compareWasm(mj, xml, ref);

      expect(mj.mj_versionString()).toBe(ref.version);
      expect(r.forward).toBeLessThan(REL_TOLERANCE);
      expect(r.contacts).toBe(0);
      expect(r.rollout).toBeLessThan(ROLLOUT_TOLERANCE);
    });
  }
});

describe('parity canary', () => {
  it('sees a planted change in actuator strength', async () => {
    const mj = await loadMujoco();
    const { xml, ref } = load('quad-servo');
    const r = compareWasm(mj, xml.replace(/kp="[\d.]+"/g, 'kp="1"'), ref);

    expect(r.rollout).toBeGreaterThan(ROLLOUT_TOLERANCE);
  });
});
