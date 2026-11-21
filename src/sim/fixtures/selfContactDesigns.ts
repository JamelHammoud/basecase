import { Vector3 } from 'three';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../../types/robotics';
import { buildRig, forwardKinematics, partMatrix, partMotion, type V3 } from '../../utils/kinematics';
import type { MjcfInput } from '../mjcfTypes';
import { box, joint, fixtureTriangles, fixtureMeasures } from './parts';
import { selfContactArmInput } from './selfContactArm';
import { closedLinkage } from './closedLinkages';

export interface SelfContactDesign {
  input: MjcfInput;
  reference: Record<string, number>;
  expected: [string, string];
  excluded: [string, string];
}

function scene(parts: ScenePart[], joints: RobotJoint[]): MjcfInput {
  const rig = buildRig(joints, parts);

  return {
    parts,
    rig,
    project: {
      ...DEFAULT_PROJECT,
      joints,
      selfContact: Object.fromEntries(rig.robots.map((robot) => [robot.key, { enabled: true }])),
    },
    measures: {},
    partTriangles: (_id: string) => null,
    fixedBase: Object.fromEntries(rig.robots.map((robot) => [robot.key, true])),
  };
}

function folding(): SelfContactDesign {
  return {
    input: selfContactArmInput(true),
    reference: { shoulder: 0, elbow: -90 },
    expected: ['base', 'tip'],
    excluded: ['upper', 'tip'],
  };
}

function crossed(legs = false): SelfContactDesign {
  const parts = [box('torso', [0, 240, 0], [60, 60, 60], 1000)];
  const joints: RobotJoint[] = [];
  const names = legs
    ? ['front-left', 'front-right', 'middle-left', 'middle-right', 'rear-left', 'rear-right']
    : ['left-arm', 'right-arm'];

  names.forEach((name, index) => {
    const x = index % 2 === 0 ? -80 : 80;
    const z = Math.floor(index / 2) * 150;
    const part = box(name, [x, 100, z], [12, 100, 12], 100);

    parts.push(part);
    joints.push({
      ...joint({ id: name, link: ['torso', name], origin: [x, 150, z], axis: [0, 0, 1], effortNm: 5 }),
      limb: legs ? 'leg' : 'arm',
    });
  });

  return {
    input: scene(parts, joints),
    reference: { [names[0]]: 90, [names[1]]: -90 },
    expected: [names[0], names[1]],
    excluded: ['torso', names[0]],
  };
}

function quadruped(): SelfContactDesign {
  const input = selfContactArmInput(true);
  const parts = input.parts.map((part) => ({
    ...part,
    position: [-part.position[0], 400 - part.position[1], part.position[2]] as V3,
  }));
  const joints = input.rig.joints.map((j) => ({
    ...j,
    origin: [-j.origin[0], 400 - j.origin[1], j.origin[2]] as V3,
    limb: 'leg' as const,
  }));

  for (let i = 0; i < 3; i++) {
    const name = `other-leg-${i}`;
    const x = i === 0 ? -60 : 60;
    const z = i === 2 ? -60 : 60;

    parts.push(box(name, [x, 250, z], [10, 60, 10], 100));
    joints.push({
      ...joint({ id: name, link: ['base', name], origin: [x, 280, z], axis: [1, 0, 0], effortNm: 5 }),
      limb: 'leg',
    });
  }

  return {
    input: scene(parts, joints),
    reference: { shoulder: 0, elbow: -90 },
    expected: ['base', 'tip'],
    excluded: ['base', 'upper'],
  };
}

function gripper(): SelfContactDesign {
  const parts = [
    box('palm', [0, 180, 0], [80, 20, 30], 400),
    box('left-finger', [-25, 100, 0], [10, 40, 20], 50),
    box('right-finger', [25, 100, 0], [10, 40, 20], 50),
  ];
  const joints = ['left-finger', 'right-finger'].map((name) =>
    joint({
      id: name,
      link: ['palm', name],
      origin: [0, 180, 0],
      axis: [1, 0, 0],
      type: 'prismatic',
      range: [-40, 40],
      effortNm: 5,
    }),
  );

  return {
    input: scene(parts, joints),
    reference: { 'left-finger': 40, 'right-finger': -40 },
    expected: ['left-finger', 'right-finger'],
    excluded: ['palm', 'left-finger'],
  };
}

function camera(): SelfContactDesign {
  const input = selfContactArmInput(true);
  const parts = [
    box('base', [0, 100, 0], [40, 40, 40], 500),
    box('upper', [0, 130, 0], [10, 60, 10], 100),
    box('tip', [25, 160, 0], [50, 30, 30], 200),
  ];
  const joints = input.rig.joints.map((j) => (j.id === 'elbow' ? { ...j, origin: [0, 160, 0] as V3 } : j));

  return {
    input: scene(parts, joints),
    reference: { shoulder: 0, elbow: -90 },
    expected: ['base', 'tip'],
    excluded: ['upper', 'tip'],
  };
}

function snake(): SelfContactDesign {
  const arm = selfContactArmInput(true);
  const parts = arm.parts
    .filter((part) => part.id !== 'tip')
    .map((part) => (part.id === 'upper' ? { ...part, position: [0, 150, -20] as V3 } : part));
  const joints = [arm.rig.joints[0]];

  for (let i = 0; i < 3; i++) {
    const name = i === 2 ? 'tip' : `segment-${i}`;
    const parent = i === 0 ? 'upper' : `segment-${i - 1}`;

    parts.push(box(name, [15 + i * 30, 200, 0], [30, 10, 10], 50));
    joints.push(
      joint({ id: `bend-${i}`, link: [parent, name], origin: [i * 30, 200, 0], axis: [0, 0, 1], effortNm: 5 }),
    );
  }

  return {
    input: scene(parts, joints),
    reference: { shoulder: 0, 'bend-0': -90, 'bend-1': 0, 'bend-2': 0, 'bend-3': 0 },
    expected: ['base', 'tip'],
    excluded: ['segment-1', 'tip'],
  };
}

function lamp(): SelfContactDesign {
  const arm = selfContactArmInput(true);
  const parts = [
    ...arm.parts.filter((part) => part.id !== 'tip'),
    box('forearm', [35, 200, 0], [70, 10, 10], 100),
    box('shade', [90, 200, 0], [30, 30, 50], 200),
  ];
  const joints = [
    arm.rig.joints[0],
    { ...arm.rig.joints[1], child: ['forearm'] },
    {
      ...joint({ id: 'shade-hinge', link: ['forearm', 'shade'], origin: [75, 200, 0], axis: [0, 0, 1], effortNm: 0 }),
      actuation: 'passive' as const,
      damping: 0.1,
      range: [0, 0] as [number, number],
    },
  ];

  return {
    input: scene(parts, joints),
    reference: { shoulder: 0, elbow: -90 },
    expected: ['base', 'shade'],
    excluded: ['forearm', 'shade'],
  };
}

function payload(): SelfContactDesign {
  const arm = selfContactArmInput(true);
  const parts = [...arm.parts, box('payload', [70, 200, 20], [30, 30, 30], 800)];
  const joints = arm.rig.joints.map((j) => (j.id === 'elbow' ? { ...j, child: [...j.child, 'payload'] } : j));

  return {
    input: scene(parts, joints),
    reference: { shoulder: 0, elbow: -90 },
    expected: ['base', 'tip'],
    excluded: ['tip', 'payload'],
  };
}

function sketch(): SelfContactDesign {
  const fixture = closedLinkage();
  const { crankJoint } = fixture.builds[0];
  const coupler = fixture.input.parts.find((part) => part.id === 'fb0-coupler')!;
  const posed = forwardKinematics(fixture.input.rig, { values: { [crankJoint]: 120 } });
  const half = [coupler.dimensions.width, coupler.dimensions.height, coupler.dimensions.depth].map(
    (value) => value * 0.45,
  );
  const place = partMatrix(coupler);
  const inverse = place.clone().invert();
  const motion = partMotion(fixture.input.rig, posed, coupler.id)!;
  const candidates = Array.from({ length: 8 }, (_, i) => {
    const point = new Vector3(...(half.map((value, axis) => value * (i & (1 << axis) ? 1 : -1)) as V3))
      .applyMatrix4(place)
      .applyMatrix4(motion);
    const local = point.clone().applyMatrix4(inverse);
    const distance = Math.hypot(
      ...local.toArray().map((value, axis) => Math.max(0, Math.abs(value) - half[axis] / 0.9)),
    );

    return { point, distance };
  });
  const at = candidates.toSorted((a, b) => b.distance - a.distance)[0].point;
  const stop = box('base-stop', at.toArray(), [8, 8, 8], 100);
  const parts = [...fixture.input.parts, stop];
  const joints = fixture.input.rig.joints.map((j) =>
    j.id === crankJoint ? { ...j, parent: [...j.parent, stop.id] } : j,
  );
  const input = scene(parts, joints);

  return {
    input: { ...fixture.input, ...input, measures: fixtureMeasures(parts), partTriangles: fixtureTriangles(parts) },
    reference: { [crankJoint]: 120 },
    expected: ['base-stop', coupler.id],
    excluded: [coupler.id, 'fb0-rocker'],
  };
}

export const selfContactDesigns = [
  { name: 'folding arm', build: folding },
  { name: 'crossed humanoid arms', build: () => crossed() },
  { name: 'quadruped leg and torso', build: quadruped },
  { name: 'neighboring hexapod legs', build: () => crossed(true) },
  { name: 'opposed gripper fingers', build: gripper },
  { name: 'pan-tilt camera and mount', build: camera },
  { name: 'folded snake', build: snake },
  { name: 'desk-lamp linkage', build: lamp },
  { name: 'asymmetric payload arm', build: payload },
  { name: 'closed Sketch mechanism', build: sketch },
];
