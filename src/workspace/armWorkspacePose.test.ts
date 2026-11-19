import { expect, it } from 'vitest';
import { armWorkspaceCase } from '../skills/armWorkspaceCases';
import type { RootOffset } from '../types/robotics';
import { buildMjcf } from '../sim/mjcf';
import { assertWorkspacePose } from './armWorkspacePose';

it('preserves joint poses but refuses whole-body offsets ignored by fixed-base compilation', () => {
  const { input, model } = armWorkspaceCase('three-axis');
  const robot = input.rig.robots[0];

  expect(model.robots[0].floating).toBe(false);
  expect(() => assertWorkspacePose(input.rig, input.pose)).not.toThrow();
  expect(() => assertWorkspacePose(input.rig, undefined)).not.toThrow();

  const offsets: RootOffset[] = [{ position: [40, 0, 0] }, { rotation: [0, 30, 0] }];

  for (const root of offsets) {
    const pose = { ...input.pose, root };
    const compiled = buildMjcf({ ...input, pose });

    expect(compiled.xml).toBe(model.xml);
    expect(compiled.initial).toEqual(model.initial);
    expect(() => assertWorkspacePose(input.rig, pose)).toThrow(/Rest Pose/);
    expect(() => assertWorkspacePose(input.rig, { ...input.pose, roots: { [robot.key]: root } })).toThrow(/Rest Pose/);
  }
});

it('checks parked robots and follows ordinary keyed-root precedence', () => {
  const { input } = armWorkspaceCase('dual-arm');
  const parked = input.rig.robots[1].key;

  expect(() =>
    assertWorkspacePose(input.rig, { ...input.pose, roots: { [parked]: { position: [0, 0, 50] } } }),
  ).toThrow(/Rest Pose/);

  const single = armWorkspaceCase('three-axis').input;

  expect(() =>
    assertWorkspacePose(single.rig, {
      ...single.pose,
      root: { position: [50, 0, 0] },
      roots: { [single.rig.robots[0].key]: { position: [0, 0, 0] } },
    }),
  ).not.toThrow();
});
