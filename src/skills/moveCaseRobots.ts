import { box, joint, type FixtureRobot, type JointSpec, type P3 } from '../sim/fixtures/parts';

const X: P3 = [1, 0, 0];
const Z: P3 = [0, 0, 1];

const EFFORT = 1.9;
const HIP_Y = 170;
const LINK = 70;
const T = 24;
const BODY: P3 = [140, 150, 70];
const SHOULDER_Y = HIP_Y + BODY[1] - 15;
const ARM = 60;

type Side = 'left' | 'right';

const sideX = (side: Side, x: number) => (side === 'left' ? -x : x);

function g1Leg(side: Side) {
  const x = sideX(side, 45);
  const foot: P3 = [50, 12, 90];
  const id = (name: string) => `${side}_${name}`;
  const parts = [
    box(id('hip_link'), [x, HIP_Y, 0], [T, T, T], 50),
    box(id('thigh_link'), [x, HIP_Y - LINK / 2, 0], [T, LINK, T], 70),
    box(id('shin_link'), [x, HIP_Y - LINK * 1.5, 0], [T, LINK, T], 60),
    box(id('foot_link'), [x, HIP_Y - LINK * 2 - foot[1] / 2, 0], foot, 40),
  ];
  const specs: JointSpec[] = [
    {
      id: id('hip_pitch_joint'),
      link: ['torso_link', id('hip_link')],
      origin: [x, HIP_Y, 0],
      axis: X,
      effortNm: EFFORT,
    },
    {
      id: id('hip_roll_joint'),
      link: [id('hip_link'), id('thigh_link')],
      origin: [x, HIP_Y, 0],
      axis: Z,
      effortNm: EFFORT,
      parentJoint: id('hip_pitch_joint'),
      range: [-30, 30],
    },
    {
      id: id('knee_joint'),
      link: [id('thigh_link'), id('shin_link')],
      origin: [x, HIP_Y - LINK, 0],
      axis: X,
      effortNm: EFFORT,
      parentJoint: id('hip_roll_joint'),
      range: [-120, 120],
    },
    {
      id: id('ankle_pitch_joint'),
      link: [id('shin_link'), id('foot_link')],
      origin: [x, HIP_Y - LINK * 2, 0],
      axis: X,
      effortNm: EFFORT,
      parentJoint: id('knee_joint'),
      range: [-50, 50],
    },
  ];

  return { parts, joints: specs.map(joint) };
}

function g1Arm(side: Side) {
  const x = sideX(side, BODY[0] / 2 + 12);
  const id = (name: string) => `${side}_${name}`;
  const parts = [
    box(id('shoulder_link'), [x, SHOULDER_Y, 0], [20, 20, 20], 20),
    box(id('upper_arm_link'), [x, SHOULDER_Y - ARM / 2, 0], [18, ARM, 18], 30),
    box(id('forearm_link'), [x, SHOULDER_Y - ARM * 1.5, 0], [16, ARM, 16], 25),
  ];
  const specs: JointSpec[] = [
    {
      id: id('shoulder_pitch_joint'),
      link: ['torso_link', id('shoulder_link')],
      origin: [x, SHOULDER_Y, 0],
      axis: X,
      effortNm: EFFORT,
      range: [-150, 150],
      limb: 'arm',
    },
    {
      id: id('shoulder_roll_joint'),
      link: [id('shoulder_link'), id('upper_arm_link')],
      origin: [x, SHOULDER_Y, 0],
      axis: Z,
      effortNm: EFFORT,
      parentJoint: id('shoulder_pitch_joint'),
      range: [-120, 120],
      limb: 'arm',
    },
    {
      id: id('elbow_joint'),
      link: [id('upper_arm_link'), id('forearm_link')],
      origin: [x, SHOULDER_Y - ARM, 0],
      axis: X,
      effortNm: EFFORT,
      parentJoint: id('shoulder_roll_joint'),
      range: [-120, 120],
      limb: 'arm',
    },
  ];

  return { parts, joints: specs.map(joint) };
}

export function g1Humanoid(): FixtureRobot {
  const limbs = [g1Leg('left'), g1Leg('right'), g1Arm('left'), g1Arm('right')];

  return {
    id: 'g1-style-humanoid',
    parts: [box('torso_link', [0, HIP_Y + BODY[1] / 2, 0], BODY, 450), ...limbs.flatMap((l) => l.parts)],
    joints: limbs.flatMap((l) => l.joints),
    expect: { morphology: 'legged', stand: 'pass', walk: 'uncertain' },
  };
}
