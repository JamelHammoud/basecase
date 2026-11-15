import { describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { clockSkill, quadWave } from '../skills/moveFixtures';
import { routineBody } from './physicsBody';
import { controllerStamp, pairStamp, physicsStamp } from './skillStamps';

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

  it('invalidates scripted-drive proofs even when the library contains an incompatible policy', () => {
    const quad = fixtureModel('quad-servo');
    const skill = { ...clockSkill(quad, quadWave()), name: 'Velocity tracking' };
    const model = fixtureModel('rover-diff');
    const drive = {
      kind: 'rover' as const,
      robot: model.robots[0].key,
      wheels: [],
      maxSpeedMmS: 200,
      maxTurnRadS: 1,
    };
    const scene = { skills: [skill], drive };
    const pair = { from: 'walk', to: 'turn-away' };

    expect(routineBody(model, [], scene)?.policies.velocity).toBeNull();
    expect(pairStamp({ ...scene, drive: { ...drive, maxTurnRadS: 2 } }, pair)).not.toBe(pairStamp(scene, pair));
  });

  it('binds a moving predecessor to the Settle controller that produces its start stance', () => {
    const model = fixtureModel('quad-servo');
    const wave = clockSkill(model, quadWave());
    const velocity = { ...wave, name: 'Velocity tracking' };
    const settle = { ...wave, name: 'Settle to neutral' };
    const changed = structuredClone(settle);

    if (changed.controller.kind !== 'policy') throw new Error('Missing fixture policy');

    changed.controller.policy.trainedSteps += 1;

    const scene = { skills: [wave, velocity, settle] };
    const pair = { from: 'walk', to: 'wave' };

    expect(pairStamp({ skills: [wave, velocity, changed] }, pair)).not.toBe(pairStamp(scene, pair));
  });
});
