import fs from 'node:fs';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { compareWasm, REL_TOLERANCE, ROLLOUT_TOLERANCE, type Reference } from '../parity/compare';

const ROOT = path.resolve('verify/out/servo/fixtures');
const robots = fs.existsSync(ROOT)
  ? fs.readdirSync(ROOT).filter((n) => fs.existsSync(path.join(ROOT, n, 'reference.json')))
  : [];

describe('WASM matches C MuJoCo on robots driven by measured servo models', () => {
  it('has servo fixtures to compare', () => {
    expect(robots.length).toBeGreaterThanOrEqual(12);
  });

  for (const name of robots) {
    it(name, async () => {
      const mj = await loadMujoco();
      const xml = fs.readFileSync(path.join(ROOT, name, 'model.xml'), 'utf8');
      const ref = JSON.parse(fs.readFileSync(path.join(ROOT, name, 'reference.json'), 'utf8')) as Reference;
      const r = compareWasm(mj, xml, ref);

      expect(xml).toMatch(/ delay="/);
      expect(mj.mj_versionString()).toBe(ref.version);
      expect(r.forward).toBeLessThan(REL_TOLERANCE);
      expect(r.contacts).toBe(0);
      expect(r.rollout).toBeLessThan(ROLLOUT_TOLERANCE);
    });
  }
});
