import { box, cylinder, joint, type FixtureRobot, type JointSpec, type P3 } from './parts';

const X: P3 = [1, 0, 0];
const Z: P3 = [0, 0, 1];
const Y: P3 = [0, 1, 0];

interface LegSpec {
  key: string;
  at: [number, number];
  hipY: number;
  link: number;
  effort: number;
  linkG: number;
}

function threeDofLeg(leg: LegSpec) {
  const { key, at, hipY, link, effort, linkG } = leg;
  const [x, z] = at;
  const thickness = 20;
  const parts = [
    box(`${key}_hip`, [x, hipY, z], [thickness, thickness, thickness], linkG),
    box(`${key}_upper`, [x, hipY - link / 2, z], [thickness, link, thickness], linkG),
    box(`${key}_lower`, [x, hipY - link * 1.5, z], [thickness, link, thickness], linkG),
  ];
  const specs: JointSpec[] = [
    {
      id: `${key}_abduct`,
      link: ['body', `${key}_hip`],
      origin: [x, hipY, z],
      axis: Z,
      effortNm: effort,
      range: [-40, 40],
    },
    {
      id: `${key}_swing`,
      link: [`${key}_hip`, `${key}_upper`],
      origin: [x, hipY, z],
      axis: X,
      effortNm: effort,
      parentJoint: `${key}_abduct`,
      range: [-90, 90],
    },
    {
      id: `${key}_bend`,
      link: [`${key}_upper`, `${key}_lower`],
      origin: [x, hipY - link, z],
      axis: X,
      effortNm: effort,
      parentJoint: `${key}_swing`,
      range: [-130, 130],
    },
  ];

  return { parts, joints: specs.map(joint) };
}

interface WalkerSpec {
  id: string;
  corners: Array<[number, number]>;
  bodySize: P3;
  bodyG: number;
  hipY: number;
  link: number;
  effort: number;
  linkG: number;
  expect: FixtureRobot['expect'];
}

function multiLegged(s: WalkerSpec): FixtureRobot {
  const legs = s.corners.map((at, i) =>
    threeDofLeg({ key: `leg${i}`, at, hipY: s.hipY, link: s.link, effort: s.effort, linkG: s.linkG }),
  );

  return {
    id: s.id,
    parts: [box('body', [0, s.hipY + s.bodySize[1] / 2, 0], s.bodySize, s.bodyG), ...legs.flatMap((l) => l.parts)],
    joints: legs.flatMap((l) => l.joints),
    expect: s.expect,
  };
}

const QUAD_CORNERS: Array<[number, number]> = [
  [-70, -90],
  [70, -90],
  [-70, 90],
  [70, 90],
];

const HEX_CORNERS: Array<[number, number]> = [
  [-80, -110],
  [80, -110],
  [-80, 0],
  [80, 0],
  [-80, 110],
  [80, 110],
];

const quadServo = (): FixtureRobot =>
  multiLegged({
    id: 'quad-servo',
    corners: QUAD_CORNERS,
    bodySize: [160, 50, 200],
    bodyG: 700,
    hipY: 130,
    link: 65,
    effort: 1.9,
    linkG: 70,
    expect: { morphology: 'legged', stand: 'pass', walk: 'pass' },
  });

const quadBig = (): FixtureRobot =>
  multiLegged({
    id: 'quad-big',
    corners: QUAD_CORNERS.map(([x, z]) => [x * 2, z * 2]),
    bodySize: [320, 100, 400],
    bodyG: 5000,
    hipY: 260,
    link: 130,
    effort: 12,
    linkG: 400,
    expect: { morphology: 'legged', stand: 'pass', walk: 'pass' },
  });

const hexapod = (): FixtureRobot =>
  multiLegged({
    id: 'hexapod',
    corners: HEX_CORNERS,
    bodySize: [180, 40, 260],
    bodyG: 800,
    hipY: 100,
    link: 50,
    effort: 1.9,
    linkG: 50,
    expect: { morphology: 'legged', stand: 'pass', walk: 'pass' },
  });

const weakQuad = (): FixtureRobot =>
  multiLegged({
    id: 'must-fail-weak-quad',
    corners: QUAD_CORNERS,
    bodySize: [160, 50, 200],
    bodyG: 700,
    hipY: 130,
    link: 65,
    effort: 0.1,
    linkG: 70,
    expect: { morphology: 'legged', stand: 'fail', walk: 'fail' },
  });

function bipedLeg(side: 'l' | 'r', x: number, scale: number, effort: number) {
  const hipY = 170 * scale;
  const link = 70 * scale;
  const t = 24 * scale;
  const key = `${side}`;
  const foot: P3 = [50 * scale, 12 * scale, 90 * scale];
  const parts = [
    box(`${key}_hipblock`, [x, hipY, 0], [t, t, t], 50),
    box(`${key}_thigh`, [x, hipY - link / 2, 0], [t, link, t], 70),
    box(`${key}_shin`, [x, hipY - link * 1.5, 0], [t, link, t], 60),
    box(`${key}_sole`, [x, hipY - link * 2 - foot[1] / 2, 0], foot, 40),
  ];
  const specs: JointSpec[] = [
    {
      id: `${key}_roll`,
      link: ['body', `${key}_hipblock`],
      origin: [x, hipY, 0],
      axis: Z,
      effortNm: effort,
      range: [-30, 30],
    },
    {
      id: `${key}_pitch`,
      link: [`${key}_hipblock`, `${key}_thigh`],
      origin: [x, hipY, 0],
      axis: X,
      effortNm: effort,
      parentJoint: `${key}_roll`,
    },
    {
      id: `${key}_bend`,
      link: [`${key}_thigh`, `${key}_shin`],
      origin: [x, hipY - link, 0],
      axis: X,
      effortNm: effort,
      parentJoint: `${key}_pitch`,
      range: [-120, 120],
    },
    {
      id: `${key}_tilt`,
      link: [`${key}_shin`, `${key}_sole`],
      origin: [x, hipY - link * 2, 0],
      axis: X,
      effortNm: effort,
      parentJoint: `${key}_bend`,
      range: [-50, 50],
    },
  ];

  return { parts, joints: specs.map(joint) };
}

function biped(id: string, scale: number, effort: number): FixtureRobot {
  const legs = [bipedLeg('l', -45 * scale, scale, effort), bipedLeg('r', 45 * scale, scale, effort)];
  const size: P3 = [140 * scale, 90 * scale, 70 * scale];

  return {
    id,
    parts: [box('body', [0, 170 * scale + size[1] / 2, 0], size, 450), ...legs.flatMap((l) => l.parts)],
    joints: legs.flatMap((l) => l.joints),
    expect: { morphology: 'legged', stand: 'pass', walk: 'uncertain' },
  };
}

function arm(id: string, links: number, effort: number): FixtureRobot {
  const length = 70;
  const parts = [box('base', [0, 25, 0], [80, 50, 80], 400)];
  const joints = [];
  let previous = 'base';
  let parentJoint: string | undefined;

  for (let i = 0; i < links; i++) {
    const name = `link${i}`;
    const y = 50 + length * i;

    parts.push(box(name, [0, y + length / 2, 0], [24, length, 24], 60));
    joints.push(
      joint({
        id: `arm${i}`,
        link: [previous, name],
        origin: [0, y, 0],
        axis: i % 2 === 0 && i > 0 ? Y : X,
        effortNm: effort,
        parentJoint,
        limb: 'arm',
      }),
    );
    previous = name;
    parentJoint = `arm${i}`;
  }

  return { id, parts, joints, expect: { morphology: 'fixed', stand: 'n/a', walk: 'n/a' } };
}

const FINGER: P3 = [8, 26, 20];
const FINGER_GAP_MM = 50;
const FINGER_TRAVEL_MM = 25;

const GRIPPER_PARTS = new Set(['palm', 'finger_left', 'finger_right']);

export function withoutGripper(robot: FixtureRobot): FixtureRobot {
  return {
    ...robot,
    parts: robot.parts.filter((p) => !GRIPPER_PARTS.has(p.id)),
    joints: robot.joints
      .filter((j) => !GRIPPER_PARTS.has(j.id))
      .map((j) => ({ ...j, child: j.child.filter((id) => !GRIPPER_PARTS.has(id)) })),
  };
}

function withGripper(robot: FixtureRobot): FixtureRobot {
  const wrist = robot.joints.at(-1)!;
  const top = Math.max(...robot.parts.map((p) => p.position[1] + p.dimensions.height / 2));
  const palm = box('palm', [0, top + 6, 0], [FINGER_GAP_MM + FINGER[0] * 2, 12, FINGER[2]], 20);
  const y = top + 12 + FINGER[1] / 2;
  const x = (FINGER_GAP_MM + FINGER[0]) / 2;
  const fingers = (
    [
      ['left', -1],
      ['right', 1],
    ] as const
  ).map(([side, sign]) => ({
    part: box(`finger_${side}`, [sign * x, y, 0], FINGER, 15),
    joint: joint({
      id: `finger_${side}`,
      link: [wrist.child[0], `finger_${side}`],
      origin: [sign * x, y, 0],
      axis: X,
      effortNm: 5,
      type: 'prismatic',
      range: sign < 0 ? [0, FINGER_TRAVEL_MM] : [-FINGER_TRAVEL_MM, 0],
      parentJoint: wrist.id,
    }),
  }));

  return {
    ...robot,
    parts: [...robot.parts, palm, ...fingers.map((f) => f.part)],
    joints: [
      ...robot.joints.slice(0, -1),
      { ...wrist, child: [...wrist.child, 'palm'] },
      ...fingers.map((f) => f.joint),
    ],
  };
}

const ACROSS_X: P3 = [0, 0, 90];
const WHEEL_WIDTH_MM = 20;

type WheelShape = 'box' | 'cylinder';

function wheelPart(id: string, at: P3, shape: WheelShape) {
  const radius = at[1];

  if (shape === 'box') return box(id, at, [WHEEL_WIDTH_MM, radius * 2, radius * 2], 80);

  return { ...cylinder(id, at, [radius * 2, WHEEL_WIDTH_MM, radius * 2], 80), rotation: ACROSS_X };
}

function wheel(side: string, at: P3, shape: WheelShape) {
  return {
    part: wheelPart(`${side}_wheel_disc`, at, shape),
    joint: joint({
      id: `${side}_wheel`,
      link: ['chassis', `${side}_wheel_disc`],
      origin: at,
      axis: X,
      effortNm: 1.5,
      range: null,
    }),
  };
}

const DIFF_WHEELS: Array<[string, number, number]> = [
  ['left', -85, 0],
  ['right', 85, 0],
  ['caster', 0, 90],
];

function rover(id: string, positions: Array<[string, number, number]>, shape: WheelShape = 'box'): FixtureRobot {
  const radius = 35;
  const wheels = positions.map(([side, x, z]) => wheel(side, [x, radius, z], shape));

  return {
    id,
    parts: [box('chassis', [0, radius + 15, 0], [140, 40, 200], 900), ...wheels.map((w) => w.part)],
    joints: wheels.map((w) => w.joint),
    expect: { morphology: 'wheeled', stand: 'n/a', walk: 'n/a' },
  };
}

export const roundWheelRover = (): FixtureRobot => rover('rover-diff-round', DIFF_WHEELS, 'cylinder');

function wheelLegged(): FixtureRobot {
  const hipY = 170;
  const link = 60;
  const leg = (side: string, x: number) => {
    const parts = [
      box(`${side}_thigh`, [x, hipY - link / 2, 0], [20, link, 20], 80),
      box(`${side}_shin`, [x, hipY - link * 1.5, 0], [20, link, 20], 70),
      box(`${side}_wheel_disc`, [x, 40, 0], [20, 80, 80], 90),
    ];
    const joints = [
      joint({ id: `${side}_swing`, link: ['body', `${side}_thigh`], origin: [x, hipY, 0], axis: X, effortNm: 2.5 }),
      joint({
        id: `${side}_bend`,
        link: [`${side}_thigh`, `${side}_shin`],
        origin: [x, hipY - link, 0],
        axis: X,
        effortNm: 2.5,
        parentJoint: `${side}_swing`,
      }),
      joint({
        id: `${side}_wheel`,
        link: [`${side}_shin`, `${side}_wheel_disc`],
        origin: [x, 40, 0],
        axis: X,
        effortNm: 1.5,
        parentJoint: `${side}_bend`,
        range: null,
      }),
    ];

    return { parts, joints };
  };
  const legs = [leg('l', -80), leg('r', 80)];

  return {
    id: 'wheel-legged',
    parts: [box('body', [0, hipY + 25, 0], [140, 50, 100], 700), ...legs.flatMap((l) => l.parts)],
    joints: legs.flatMap((l) => l.joints),
    expect: { morphology: 'wheel-legged', stand: 'uncertain' as 'pass', walk: 'uncertain' },
  };
}

function reversedQuad(): FixtureRobot {
  const q = quadServo();
  const joints = q.joints.map((j) =>
    j.id === 'leg0_bend' ? { ...j, axis: [-1, 0, 0] as P3, range: [0, 130] as [number, number] } : j,
  );

  return { ...q, id: 'must-flag-odd-knee', joints, expect: { morphology: 'legged', stand: 'pass', walk: 'uncertain' } };
}

export function fixtureRobots(): FixtureRobot[] {
  return [
    quadServo(),
    quadBig(),
    hexapod(),
    biped('biped-servo', 1, 1.9),
    biped('biped-tiny', 0.5, 0.6),
    arm('arm-3dof', 3, 3),
    withGripper(arm('arm-6dof', 6, 4)),
    rover('rover-diff', DIFF_WHEELS),
    rover('rover-four', [
      ['fl', -85, -80],
      ['fr', 85, -80],
      ['rl', -85, 80],
      ['rr', 85, 80],
    ]),
    wheelLegged(),
    weakQuad(),
    reversedQuad(),
  ];
}
