import { dividerModel } from './armMotionFixtures';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { planArmMotion } from './armMotion';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function expectClear(engine: SimEngine) {
  const contacts = engine.data.contact;

  for (let c = 0; c < engine.data.ncon; c++) {
    const contact = contacts.get(c)!;

    expect(contact.dist).toBeGreaterThanOrEqual(0);
    contact.delete();
  }

  contacts.delete();
}

it('plans a timed detour through the emitted robot and fixed world geometry', async () => {
  const model = dividerModel();
  const result = await planArmMotion(mj, model, {
    parts: ['link2'],
    keys: [{ t: 8, values: { arm0: 60, arm1: 0, arm2: 0 } }],
    horizonS: 10,
    stop: () => false,
  });

  expect(result.reason).toBe('');
  expect(result.nodes).toBeGreaterThan(0);
  expect(result.controller?.kind).toBe('animation');

  if (result.controller?.kind !== 'animation') return;

  const engine = new SimEngine(mj, model);

  try {
    const keys = result.controller.animation.keyframes;

    expect(keys[0].values.arm0).toBeCloseTo(-60);
    expect(keys.at(-1)!.values.arm0).toBeCloseTo(60);

    for (let i = 1; i < keys.length; i++) {
      const from = keys[i - 1];
      const to = keys[i];

      expect(to.t).toBeGreaterThan(from.t);

      for (let k = 0; k <= 500; k++) {
        const values = Object.fromEntries(
          Object.keys(from.values).map((id) => [id, from.values[id] + ((to.values[id] - from.values[id]) * k) / 500]),
        );

        engine.reset({ values });

        expectClear(engine);
      }
    }
  } finally {
    engine.dispose();
  }
});
