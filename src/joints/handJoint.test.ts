import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { toScene } from '../agent/agentFrame';
import { printed } from '../assembly/assembly.fixtures';
import type { ProjectSettings } from '../types/robotics';
import { runEngineering } from '../utils/engineering';
import { buildRig, forwardKinematics } from '../utils/kinematics';
import { declareJoints } from './declareJoints';
import { addHandJoint, HINGE_RANGE, uniqueJointId, withJointRange, withoutJoint } from './handJoint';

const PROJECT: ProjectSettings = { printer: 'default', material: 'PLA', infillPct: 20 };
const parts = [
  printed('base', { size: [40, 10, 40] }, [100, 0, 0], { name: 'Base', rotation: [0, 30, 0] }),
  printed('link', { size: [10, 60, 10] }, [100, 40, 0], { name: 'Upper Arm' }),
];
const CAD_ORIGIN: [number, number, number] = [100, 20, 50];
const CAD_AXIS: [number, number, number] = [0, 0.6, 0.8];

describe('define_joints through the shared module', () => {
  it('gives the same anchored joint as before', () => {
    const { next, text } = declareJoints(
      {
        joints: [
          { id: 'elbow', parent: ['base'], child: ['link'], origin: CAD_ORIGIN, axis: CAD_AXIS, range: [-45, 120] },
        ],
      },
      parts,
      PROJECT,
      () => null,
    );
    const elbow = next.joints[0];

    expect(elbow).toMatchObject({
      id: 'elbow',
      name: 'elbow',
      type: 'revolute',
      parent: ['base'],
      child: ['link'],
      origin: toScene(CAD_ORIGIN),
      axis: toScene(CAD_AXIS),
      range: [-45, 120],
    });
    expect(elbow.frame?.part).toBe('base');
    expect(elbow.frame?.origin.map((v) => Math.round(v * 1000) / 1000)).toEqual([10, 50, -17.321]);
    expect(next.firstRanges).toEqual({ elbow: [-45, 120] });
    expect(text).toContain('1 joints declared.');
  });

  it('makes the same joint from a hand-picked axis', () => {
    const at = { origin: toScene(CAD_ORIGIN), axis: toScene(CAD_AXIS) };
    const agent = declareJoints(
      {
        joints: [
          {
            id: 'upper_arm',
            name: 'Upper Arm',
            type: 'prismatic',
            parent: ['base'],
            child: ['link'],
            origin: CAD_ORIGIN,
            axis: CAD_AXIS,
            range: [-5, 30],
          },
        ],
      },
      parts,
      PROJECT,
      () => null,
    ).next.joints[0];
    const hand = addHandJoint(
      { type: 'prismatic', parent: 'base', child: 'link', at, range: [-5, 30] },
      parts,
      PROJECT,
    );

    if (typeof hand === 'string') throw new Error(hand);

    expect(hand.joint).toEqual(agent);
  });
});

describe('joints added by hand', () => {
  const at = { origin: [100, 10, 0] as [number, number, number], axis: [0, 0, 1] as [number, number, number] };

  it('names the joint after its child and turns only the child', () => {
    const made = addHandJoint(
      { type: 'revolute', parent: 'base', child: 'link', at, range: HINGE_RANGE },
      parts,
      PROJECT,
    );

    if (typeof made === 'string') throw new Error(made);

    expect(made.joint).toMatchObject({ id: 'upper_arm', name: 'Upper Arm', range: [-90, 90] });

    const rig = buildRig(made.next.joints!, parts);
    const posed = forwardKinematics(rig, { values: { upper_arm: 45 } });

    expect(rig.ownerOf.get('link')).toBe('upper_arm');
    expect(rig.ownerOf.get('base')).toBeUndefined();
    expect(posed.joint.get('upper_arm')?.equals(new THREE.Matrix4())).toBe(false);
  });

  it('refuses a part on both sides', () => {
    expect(
      addHandJoint({ type: 'revolute', parent: 'link', child: 'link', at, range: HINGE_RANGE }, parts, PROJECT),
    ).toContain("can't be on both sides");
  });

  it('keeps ids unique', () => {
    const joints = [{ id: 'upper_arm' }, { id: 'upper_arm_2' }].map((j) => ({
      ...j,
      name: j.id,
      type: 'revolute' as const,
      parent: [],
      child: [],
      origin: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
    }));

    expect(uniqueJointId(joints, 'Upper Arm')).toBe('upper_arm_3');
    expect(uniqueJointId([], '  ')).toBe('joint');
  });

  it('edits the range and deletes a joint, freeing the joints mounted on it', () => {
    const made = addHandJoint(
      { type: 'revolute', parent: 'base', child: 'link', at, range: HINGE_RANGE },
      parts,
      PROJECT,
    );

    if (typeof made === 'string') throw new Error(made);

    const mounted = {
      ...made.next,
      joints: [...made.next.joints!, { ...made.joint, id: 'wrist', parentJoint: 'upper_arm' }],
    };

    expect(withJointRange(mounted, 'upper_arm', [30, -10]).joints![0].range).toEqual([-10, 30]);

    const left = withoutJoint(mounted, 'upper_arm').joints!;

    expect(left.map((j) => j.id)).toEqual(['wrist']);
    expect(left[0].parentJoint).toBeUndefined();
  });

  const rangeRow = (project: ProjectSettings) =>
    runEngineering({ parts, project, measures: {}, servoOutputs: {} }).rows.find((r) => r.check === 'Range changes');

  const hinge = () => {
    const made = addHandJoint(
      { type: 'revolute', parent: 'base', child: 'link', at, range: HINGE_RANGE },
      parts,
      PROJECT,
    );

    if (typeof made === 'string') throw new Error(made);

    return made.next;
  };

  it('takes a range set by hand as the one to keep', () => {
    const edited = withJointRange(hinge(), 'upper_arm', [-90, 30]);

    expect(edited.firstRanges).toEqual({ upper_arm: [-90, 30] });
    expect(rangeRow(edited)?.status).toBe('pass');
  });

  it('forgets a deleted joint, so a new one on the same part starts fresh', () => {
    const gone = withoutJoint(hinge(), 'upper_arm');

    expect(gone.firstRanges).toEqual({});

    const slider = addHandJoint(
      { type: 'prismatic', parent: 'base', child: 'link', at, range: [-10, 70] },
      parts,
      gone,
    );

    if (typeof slider === 'string') throw new Error(slider);

    expect(slider.joint.id).toBe('upper_arm');
    expect(slider.next.firstRanges).toEqual({ upper_arm: [-10, 70] });
    expect(rangeRow(slider.next)?.status).toBe('pass');
  });
});
