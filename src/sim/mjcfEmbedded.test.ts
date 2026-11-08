import { describe, expect, it } from 'vitest';
import { fixtureRobot, modelOf } from '../skills/fixtureModels';
import { box } from './fixtures/parts';
import type { SimModel } from './mjcfTypes';

const quad = fixtureRobot('quad-servo');
const body = quad.parts.find((p) => p.id === 'body')!;
const top = body.position[1] + body.dimensions.height / 2;

const withPart = (...extra: ReturnType<typeof box>[]) => modelOf({ ...quad, parts: [...quad.parts, ...extra] });
const bodyOf = (model: SimModel, id: string) => model.bodies.find((b) => b.parts.includes(id))?.name ?? null;

describe('a fixed part that starts sunk into a robot', () => {
  it('rides on the robot body it is sunk into', () => {
    const model = withPart(box('speaker', [0, top + 5, -50], [40, 40, 40], 20));

    expect(bodyOf(model, 'speaker')).toBe(bodyOf(model, 'body'));
    expect(model.massKg[model.robots[0].key]).toBeCloseTo(modelOf(quad).massKg[model.robots[0].key] + 0.02, 6);
  });

  it('stays in the world when it only rests on the robot', () => {
    const model = withPart(box('speaker', [0, top + 5, -50], [40, 10, 40], 20));

    expect(bodyOf(model, 'speaker')).toBeNull();
  });

  it('stays in the world when it is bigger than the robot around it', () => {
    const model = withPart(box('arch', [0, top, 0], [2000, 2000, 2000], 0));

    expect(bodyOf(model, 'arch')).toBeNull();
  });

  it('leaves loose objects free', () => {
    const ball = { ...box('ball', [0, top + 5, -50], [40, 40, 40], 20), physics: { dynamic: true } };
    const model = withPart(ball);

    expect(bodyOf(model, 'ball')).not.toBe(bodyOf(model, 'body'));
  });

  it('keeps every other part where it was', () => {
    const before = modelOf(quad);
    const after = withPart(box('speaker', [0, top + 5, -50], [40, 40, 40], 20));

    expect(after.bodies.map((b) => b.parts.filter((id) => id !== 'speaker'))).toEqual(
      before.bodies.map((b) => b.parts),
    );
  });
});
