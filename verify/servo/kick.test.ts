import fs from 'node:fs';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it, vi } from 'vitest';
import { SimEngine } from '../../src/sim/engine';
import { servoRobots, weightless } from './robots';

vi.mock('../../src/sim/ctrlHistory', async (original) => {
  const real = await original<typeof import('../../src/sim/ctrlHistory')>();

  return process.env.SERVO_CANARY === 'no-prime' ? { ...real, primeCtrlHistory: () => {} } : real;
});

const OUT = path.resolve('verify/out/servo/fixtures');
const WINDOW_S = 0.05;
const MAX_SHARE = 0.05;
const robots = servoRobots();

describe('servo fixtures', () => {
  it('every fixture robot gets catalog servos with measured dynamics', () => {
    expect(robots.length).toBeGreaterThanOrEqual(12);

    for (const { id, model } of robots) {
      const dir = path.join(OUT, id);

      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'model.xml'), model.xml);
      expect(model.joints.filter((j) => j.drive === 'position').every((j) => j.dynamics === 'measured')).toBe(true);
      expect(model.xml).toMatch(/ delay="/);
    }
  });
});

describe('no kick at reset: a robot at rest stays under 5% of force range for 50 ms', () => {
  for (const { id, model } of robots) {
    it(id, async () => {
      const mj = await loadMujoco();
      const engine = new SimEngine(mj, weightless(model));
      const position = model.joints.filter((j) => j.drive === 'position').map((j) => j.actuator);
      const range = engine.model.actuator_forcerange;
      let peak = 0;

      engine.step(WINDOW_S, () => {
        for (const a of position) peak = Math.max(peak, Math.abs(engine.data.actuator_force[a]) / range[a * 2 + 1]);
      });
      engine.dispose();

      expect(position.length).toBeGreaterThan(0);
      expect(peak).toBeLessThan(MAX_SHARE);
    });
  }
});
