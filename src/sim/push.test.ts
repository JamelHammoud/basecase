import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import { pushRequest } from './push';
import { rootPositions } from './rootPositions';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function pushed(id: string, angle: number) {
  const model = fixtureModel(id);
  const engine = new SimEngine(mj, model);

  engine.setController({ kind: 'hold' });
  engine.step(1);

  const key = model.robots[0].key;
  const before = rootPositions(model, engine.poses())[key];
  const push = pushRequest(model, undefined, angle)!;

  engine.pushRobot(push.robot, push.force);
  engine.step(1.5);

  const after = engine.stats().robots[0];
  const position = rootPositions(model, engine.poses())[key];

  engine.dispose();

  return { moved: Math.hypot(position[0] - before[0], position[1] - before[1]), fellAt: after.fellAt };
}

describe('Push', () => {
  it.each(['rover-diff', 'rover-four'])('shoves %s at least 10 cm sideways or along its wheels', (id) => {
    for (const angle of [0, Math.PI / 2]) {
      const { moved, fellAt } = pushed(id, angle);

      expect(moved).toBeGreaterThan(0.1);
      expect(fellAt).toBeNull();
    }
  });

  it('leaves a crouched quadruped standing', () => {
    expect(pushed('quad-servo', 0).fellAt).toBeNull();
  });
});
