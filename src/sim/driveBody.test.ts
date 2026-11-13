import { describe, expect, it } from 'vitest';
import { buildRig } from '../utils/kinematics';
import { humanoid } from '../utils/mocap.fixtures';
import { bodyAccess, bodyOffer } from './driveBody';
import { fixtureRobots } from './fixtures/robots';
import type { SimModel } from './mjcfTypes';
import type { PolicySpec } from './policy';

const fixture = (id: string) => {
  const r = fixtureRobots().find((x) => x.id === id)!;

  return { parts: r.parts, rig: buildRig(r.joints, r.parts) };
};

const modelOf = (key: string, morphology: string, floating: boolean) =>
  ({ robots: [{ key, morphology, floating }] }) as unknown as SimModel;

const WALK = { policy: { joints: [] } as unknown as PolicySpec, topSpeed: 0.4 };

describe('driving a robot from a body', () => {
  const g1 = humanoid();
  const key = g1.rig.robots[0].key;

  it('offers the camera to humanoids and fixed arms, never to rovers or walkers without arms', () => {
    expect(bodyOffer(g1.rig, g1.parts)).toBe(true);
    expect(bodyOffer(fixture('arm-6dof').rig, fixture('arm-6dof').parts)).toBe(true);
    expect(bodyOffer(fixture('rover-diff').rig, fixture('rover-diff').parts)).toBe(false);
    expect(bodyOffer(fixture('quad-servo').rig, fixture('quad-servo').parts)).toBe(false);
  });

  it('drives a humanoid by pose, pinned when it has no ready Walk', () => {
    const access = bodyAccess({ ...g1, model: modelOf(key, 'legged', true) });

    expect(access).toMatchObject({ kind: 'ready', cls: 'pose', pin: key, needsFallCheck: false });
  });

  it('runs a ready Walk under the arms in place of the pin', () => {
    const access = bodyAccess({ ...g1, model: modelOf(key, 'legged', true), velocity: WALK });

    if (access.kind !== 'ready' || access.setup.kind !== 'pose') throw new Error('expected a pose drive');

    expect(access.pin).toBeUndefined();
    expect(access.setup.under).toEqual({ policy: WALK.policy, robot: key });
  });

  it('decides the pin from the morphology, so an already pinned model keeps asking for it', () => {
    expect(bodyAccess({ ...g1, model: modelOf(key, 'legged', false) })).toMatchObject({ pin: key });
  });

  it('aims a fixed arm’s hand, and turns a rover away', () => {
    const arm = fixture('arm-6dof');
    const rover = fixture('rover-diff');

    expect(bodyAccess({ ...arm, model: modelOf(arm.rig.robots[0].key, 'fixed', false) })).toMatchObject({
      kind: 'ready',
      cls: 'arm',
    });
    expect(bodyAccess({ ...rover, model: modelOf(rover.rig.robots[0].key, 'wheeled', true) })).toEqual({
      kind: 'none',
    });
  });
});
