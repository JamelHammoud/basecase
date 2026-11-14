import { componentSize } from '../../data/components';
import type { RobotJoint, RobotPoseState, ScenePart } from '../../types/robotics';
import { box, type FixtureRobot, type P3 } from './parts';

const X: P3 = [1, 0, 0];
const Z: P3 = [0, 0, 1];
const SERVO = 'feetech-sts3215';
const SCALE = 1.7;
const HIP_Y = 170 * SCALE;
const LINK = 70 * SCALE;
const T = 24 * SCALE;
const CROUCH_DEG = 60;

interface LegJoint {
  key: string;
  name: string;
  parent: string;
  child: string;
  y: number;
  axis: P3;
  range: [number, number];
}

const LEG: LegJoint[] = [
  { key: 'roll', name: 'hip roll', parent: '', child: 'hip', y: HIP_Y, axis: Z, range: [-30, 30] },
  { key: 'pitch', name: 'hip', parent: 'hip', child: 'thigh', y: HIP_Y, axis: X, range: [-90, 90] },
  { key: 'knee', name: 'knee', parent: 'thigh', child: 'shin', y: HIP_Y - LINK, axis: X, range: [-120, 120] },
  { key: 'ankle', name: 'ankle', parent: 'shin', child: 'sole', y: HIP_Y - LINK * 2, axis: X, range: [-50, 50] },
];

const servoPart = (id: string, at: P3, variant: string): ScenePart => ({
  ...box(id, at, [0, 0, 0], 55),
  name: 'Feetech STS3215',
  kind: 'component',
  category: 'actuators',
  componentId: SERVO,
  componentVariant: variant,
  dimensions: componentSize(SERVO),
});

function leg(side: 'l' | 'r', x: number, kneeVariant: string) {
  const word = side === 'l' ? 'Left' : 'Right';
  const link = (name: string) => (name ? `${side}_${name}` : 'body');
  const foot: P3 = [50 * SCALE, 12 * SCALE, 90 * SCALE];
  const links = [
    box(`${side}_hip`, [x, HIP_Y, 0], [T, T, T], 50),
    box(`${side}_thigh`, [x, HIP_Y - LINK / 2, 0], [T, LINK, T], 90),
    box(`${side}_shin`, [x, HIP_Y - LINK * 1.5, 0], [T, LINK, T], 80),
    box(`${side}_sole`, [x, HIP_Y - LINK * 2 - foot[1] / 2, 0], foot, 50),
  ];
  const servos = LEG.map((s) =>
    servoPart(`${side}_${s.key}_servo`, [x, s.y, 0], s.key === 'knee' ? kneeVariant : 'c001'),
  );
  const ridesOn = (name: string) => servos.filter((_, i) => LEG[i].parent === name).map((p) => p.id);
  const joints: RobotJoint[] = LEG.map((s, i) => ({
    id: `${side}_${s.key}`,
    name: `${word} ${s.name}`,
    type: 'revolute',
    limb: 'leg',
    parent: [link(s.parent), ...ridesOn(s.parent)],
    child: [link(s.child), ...ridesOn(s.child)],
    origin: [x, s.y, 0],
    axis: s.axis,
    range: s.range,
    actuators: [servos[i].id],
    ...(i ? { parentJoint: `${side}_${LEG[i - 1].key}` } : {}),
  }));

  return { parts: [...links, ...servos], joints };
}

export const FALL_BIPED_POSE: RobotPoseState = {
  values: Object.fromEntries(
    ['l', 'r'].flatMap((side) => [
      [`${side}_pitch`, -CROUCH_DEG / 2],
      [`${side}_knee`, CROUCH_DEG],
      [`${side}_ankle`, -CROUCH_DEG / 2],
    ]),
  ),
};

export function fallBiped(kneeVariant = 'c001', bodyG = 1400): FixtureRobot {
  const legs = [leg('l', -45 * SCALE, kneeVariant), leg('r', 45 * SCALE, kneeVariant)];
  const size: P3 = [140 * SCALE, 90 * SCALE, 70 * SCALE];

  return {
    id: 'fall-biped',
    parts: [box('body', [0, HIP_Y + size[1] / 2, 0], size, bodyG), ...legs.flatMap((l) => l.parts)],
    joints: legs.flatMap((l) => l.joints),
    expect: { morphology: 'legged', stand: 'pass', walk: 'uncertain' },
  };
}

export const FALL_BIPED_KNEES = ['l_knee', 'r_knee'];

export const LOADED_BODY_G = 3000;
