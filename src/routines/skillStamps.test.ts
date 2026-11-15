import { describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { clockSkill, quadWave } from '../skills/moveFixtures';
import { routineBody } from './physicsBody';
import { controllerStamp, physicsStamp } from './skillStamps';

describe('Motor Kit controller and physics bindings', () => {
  it('invalidates a proof for a weight-only change with identical biases and training metadata', () => {
    const model = fixtureModel('quad-servo');
    const skill = clockSkill(model, quadWave());

    if (skill.controller.kind !== 'policy') throw new Error('Missing fixture policy');

    const controller = structuredClone(skill.controller);

    controller.policy.layers[0].w[0] += 1;
    expect(controller.policy.layers[0].b).toEqual(skill.controller.policy.layers[0].b);
    expect(controllerStamp(controller)).not.toBe(controllerStamp(skill.controller));

    const xml = model.xml.replace(
      /forcerange="([^"]+)"/,
      (_, range: string) =>
        `forcerange="${range
          .split(' ')
          .map((force) => Number(force) * 0.9)
          .join(' ')}"`,
    );

    expect(physicsStamp({ ...model, xml })).not.toBe(physicsStamp(model));
  });

  it('selects the latest matching trained Kit policy over a bundled policy', () => {
    const model = fixtureModel('quad-servo');
    const first = { ...clockSkill(model, quadWave()), name: 'Velocity tracking' };
    const next = structuredClone(first);

    if (next.controller.kind !== 'policy') throw new Error('Missing fixture policy');

    next.controller.policy.trainedSteps += 1;

    const body = routineBody(model, [], { skills: [first, next] });

    expect(body?.policies.velocity).toBe(next.controller.policy);
  });
});
