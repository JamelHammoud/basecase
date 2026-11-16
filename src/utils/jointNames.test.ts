import { describe, expect, it, vi } from 'vitest';
import { roundWheelRover } from '../sim/fixtures/robots';
import type { RobotJoint } from '../types/robotics';
import { jointGroups, jointRowLabels, prettyJointName } from './jointNames';
import { buildRig, type Rig } from './kinematicsRig';

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

describe('jointGroups', () => {
  it('keeps section order, source order, explicit limbs and movable joints', () => {
    const joints = [
      named('right_knee'),
      named('left_elbow'),
      named('wheel'),
      { ...named('fixed_neck'), type: 'fixed' as const },
      { ...named('right_ankle'), type: 'prismatic' as const },
      named('neck_pan'),
      named('left_hip'),
      named('spine'),
      named('right_shoulder'),
      named('arm'),
      named('knee'),
      named('left_grip', 'leg'),
    ];
    const before = structuredClone(joints);
    const rig: Rig = { ...buildRig([], []), joints };
    const grouped = jointGroups(rig);

    expect(grouped.map((g) => [g.label, g.joints.map((j) => j.id)])).toEqual([
      ['Head', ['neck_pan']],
      ['Torso', ['spine']],
      ['Left arm', ['left_elbow']],
      ['Right arm', ['right_shoulder']],
      ['Arms', ['arm']],
      ['Left leg', ['left_hip', 'left_grip']],
      ['Right leg', ['right_knee', 'right_ankle']],
      ['Legs', ['knee']],
      ['Other', ['wheel']],
    ]);
    expect(grouped.flatMap((g) => g.joints).every((j) => joints.includes(j))).toBe(true);
    expect(joints).toEqual(before);
    expect(jointGroups(buildRig([], []))).toEqual([]);

    joints[1].name = 'right_elbow';

    const edited = jointGroups(rig);

    expect(edited.some((g) => g.label === 'Left arm')).toBe(false);
    expect(edited.find((g) => g.label === 'Right arm')!.joints.map((j) => j.id)).toEqual([
      'left_elbow',
      'right_shoulder',
    ]);

    edited.find((g) => g.label === 'Right leg')!.joints.pop();

    expect(grouped.find((g) => g.label === 'Right leg')!.joints).toHaveLength(2);
    expect(joints).toHaveLength(12);
  });

  it.each([300, 600])('allocates one member array for %i joints in a section', (count) => {
    const joints = Array.from({ length: count }, (_, i) => named(`left_elbow_${i}`));
    const rig: Rig = { ...buildRig([], []), joints };
    const writes = vi.spyOn(Map.prototype, 'set');
    let grouped: ReturnType<typeof jointGroups>;
    let memberArrays: unknown[];

    try {
      grouped = jointGroups(rig);
      memberArrays = writes.mock.calls.filter(([key]) => key === 'Left arm').map(([, members]) => members);
    } finally {
      writes.mockRestore();
    }

    expect(new Set(memberArrays).size).toBe(1);
    expect(grouped).toEqual([{ label: 'Left arm', joints }]);
    expect(grouped[0].joints).not.toBe(joints);
  });
});

describe('jointRowLabels', () => {
  it.each(['Left leg', 'RIGHT ARM', 'Other'])('prepares %s once for a large section', (group) => {
    const joints = Array.from({ length: 600 }, (_, i) => named(`left_elbow_${i}`));
    const before = structuredClone(joints);
    const lowercase = vi.spyOn(String.prototype, 'toLowerCase');
    let labels: Map<string, string>;
    let preparations: number;

    try {
      labels = jointRowLabels(joints, group);
      preparations = lowercase.mock.contexts.filter((value) => String(value) === group).length;
    } finally {
      lowercase.mockRestore();
    }

    expect(preparations).toBe(1);
    expect(labels.size).toBe(600);
    expect(labels.get(joints[0].id)).toBe(group === 'Other' ? 'Left elbow 0' : 'Elbow 0');
    expect(labels.get(joints[599].id)).toBe(group === 'Other' ? 'Left elbow 599' : 'Elbow 599');
    expect(joints).toEqual(before);
  });

  it('omits abbreviated sides only on names with a recognized side', () => {
    const joints = ['L_knee', 'knee_l', 'lhip', 'knee_r_middle', 'left_joint', 'joint'].map((name) => named(name));

    expect(labelsOf(joints, 'LEFT LEG')).toEqual(['L knee', 'Knee l', 'Lhip', 'Knee r middle', 'Left', 'joint']);
    expect(labelsOf(joints, 'Other')).toEqual(['L knee', 'Knee l', 'Lhip', 'Knee r middle', 'Left', 'joint']);
    expect(labelsOf(joints, 'LEFT LEG')).toEqual(['L knee', 'Knee l', 'Lhip', 'Knee r middle', 'Left', 'joint']);
  });

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
