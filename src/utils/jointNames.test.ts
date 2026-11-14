import { describe, expect, it } from 'vitest';
import { roundWheelRover } from '../sim/fixtures/robots';
import type { RobotJoint } from '../types/robotics';
import { jointGroups, jointRowLabels, prettyJointName } from './jointNames';
import { buildRig } from './kinematicsRig';

const named = (name: string, limb?: RobotJoint['limb']): RobotJoint => ({
  id: name,
  name,
  type: 'revolute',
  parent: ['a'],
  child: [name],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  ...(limb ? { limb } : {}),
});

const labelsOf = (joints: RobotJoint[], group: string) => [...jointRowLabels(joints, group).values()];

describe('jointRowLabels', () => {
  it('names the first-launch rover’s wheels as Results does', () => {
    const rover = roundWheelRover();
    const rig = buildRig(rover.joints, rover.parts);
    const shown = jointGroups(rig).flatMap((g) => [...jointRowLabels(g.joints, g.label)]);
    const labels = new Map(shown);

    expect(labels.get('left_wheel')).toBe(prettyJointName('left_wheel'));
    expect(labels.get('right_wheel')).toBe(prettyJointName('right_wheel'));
    expect(new Set(labels.values()).size).toBe(labels.size);
  });

  it('drops the side and the group’s words when the group names them', () => {
    expect(labelsOf([named('left_knee'), named('left_hip_pitch')], 'Left leg')).toEqual(['Knee', 'Hip pitch']);
    expect(labelsOf([named('neck_pan'), named('neck_tilt')], 'Head')).toEqual(['Neck pan', 'Neck tilt']);
  });

  it('keeps the side when the group doesn’t carry it', () => {
    expect(labelsOf([named('left_eye'), named('right_eye')], 'Head')).toEqual(['Left eye', 'Right eye']);
  });

  it('falls back to the full name when two short labels would match', () => {
    expect(labelsOf([named('front_other_wheel'), named('front_wheel')], 'Other')).toEqual([
      'Front other wheel',
      'Front wheel',
    ]);
  });
});
