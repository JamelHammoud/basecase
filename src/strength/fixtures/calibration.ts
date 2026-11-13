import * as THREE from 'three';
import { actuatorOf } from '../../data/components';
import type { ProjectSettings, RobotJoint, ScenePart } from '../../types/robotics';
import { STANCE_LIMITS } from '../../utils/actuatorRules';
import { sceneBuilder, type Hole, type PlateSpec, type Shank, type V3 } from './build';

const HORN_Y = 18.35;
const AXIS_X = -12.5;
const X0 = AXIS_X - 12;
const WIDTH = 24;
const G = 9.81;
const HORN_HOLES: Array<[number, number]> = [
  [AXIS_X + 7, 0],
  [AXIS_X - 7, 0],
  [AXIS_X, 7],
  [AXIS_X, -7],
];
const HORIZONTAL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

interface Seat {
  at: V3;
  shank: Shank;
  length: number;
}

export interface LinkSpec {
  id: string;
  name: string;
  variant: 'c001' | 'c018';
  hornPlate: number;
  link: (horn: (zFrom: number) => Hole[]) => PlateSpec[];
  holds: Seat[];
  payload: PlateSpec[];
  payloadCom: V3;
}

export const passLimitNm = (variant: string) => STANCE_LIMITS.pass * actuatorOf('feetech-sts3215', variant)!.stallNm;

const hornHoles = (zFrom: number) => HORN_HOLES.map(([x, z]) => ({ u: z - zFrom, v: x - X0, r: 1.7 }));

export function linkScene(spec: LinkSpec): { parts: ScenePart[]; project: ProjectSettings; torqueNm: number } {
  const b = sceneBuilder(HORIZONTAL);
  const torqueNm = passLimitNm(spec.variant);
  const reach = Math.hypot(spec.payloadCom[0] - AXIS_X, spec.payloadCom[2]);
  const link = b.printed(spec.id, spec.name, spec.link(hornHoles));
  const payload = b.printed(`${spec.id}-load`, 'Next Joint', spec.payload, {
    massG: Math.round((torqueNm / (G * (reach / 1000))) * 1000),
    com: b.point(spec.payloadCom),
  });
  const screws = [
    ...HORN_HOLES.map(([x, z], i) =>
      b.screw(
        `${spec.id}-horn-${i + 1}`,
        { type: 'socket_head', size: 'M3', length: spec.hornPlate + 3 },
        {
          at: [x, HORN_Y + spec.hornPlate, z],
          shank: '-y',
        },
      ),
    ),
    ...spec.holds.map((seat, i) =>
      b.screw(`${spec.id}-hold-${i + 1}`, { type: 'socket_head', size: 'M3', length: seat.length }, seat),
    ),
  ];
  const servo = { ...b.servo(`${spec.id}-servo`, 'Feetech STS3215', [0, 0, 0]), componentVariant: spec.variant };
  const joint: RobotJoint = {
    id: `${spec.id}-joint`,
    name: spec.name,
    type: 'revolute',
    parent: [servo.id],
    child: [link.id, payload.id, ...screws.map((s) => s.id)],
    actuators: [servo.id],
    origin: b.point([AXIS_X, HORN_Y, 0]),
    axis: b.point([0, 1, 0]),
    range: [-90, 90],
  };

  return {
    parts: [servo, link, payload, ...screws],
    project: { printer: 'default', material: 'PLA', infillPct: 15, joints: [joint] },
    torqueNm,
  };
}

const flat = (origin: V3, size: [number, number, number], holes: PlateSpec['holes'] = []): PlateSpec => ({
  origin,
  u: [0, 0, 1],
  v: [1, 0, 0],
  size,
  holes,
});

const upright = (origin: V3, size: [number, number, number], holes: PlateSpec['holes'] = []): PlateSpec => ({
  origin,
  u: [1, 0, 0],
  v: [0, 1, 0],
  size,
  holes,
});

const pair = (x: number) => [x - 6, x + 6];
const clear = (us: number[], v: number) => us.map((u) => ({ u, v, r: 1.7 }));

const thigh: LinkSpec = {
  id: 'thigh',
  name: 'Thigh',
  variant: 'c001',
  hornPlate: 4,
  link: (horn) => [
    flat([X0, HORN_Y, -12], [82, WIDTH, 4], [...horn(-12), ...pair(12).map((v) => ({ u: 74, v, r: 1.7 }))]),
  ],
  holds: pair(AXIS_X).map((x) => ({ at: [x, HORN_Y + 4, 62], shank: '-y' as const, length: 10 })),
  payload: [
    flat(
      [X0, HORN_Y - 15, 54],
      [16, WIDTH, 15],
      pair(12).map((v) => ({ u: 8, v, r: 1.25 })),
    ),
  ],
  payloadCom: [AXIS_X, HORN_Y - 8, 62],
};

function uBracket(id: string, name: string, variant: LinkSpec['variant'], wall: number): LinkSpec {
  const legY = 30;
  const holdY = HORN_Y + legY - 7;

  return {
    id,
    name,
    variant,
    hornPlate: wall,
    link: (horn) => [
      flat([X0, HORN_Y, -15], [30, WIDTH, wall], horn(-15)),
      upright([X0, HORN_Y, 15], [WIDTH, legY, wall], clear(pair(12), legY - 7)),
      upright([X0, HORN_Y, -15 - wall], [WIDTH, legY, wall], clear(pair(12), legY - 7)),
    ],
    holds: pair(AXIS_X).flatMap((x) => [
      { at: [x, holdY, 15 + wall] as V3, shank: '-z' as const, length: wall + 7 },
      { at: [x, holdY, -15 - wall] as V3, shank: '+z' as const, length: wall + 7 },
    ]),
    payload: [upright([X0, HORN_Y + wall + 4, -15], [WIDTH, legY - wall - 4, 30])],
    payloadCom: [AXIS_X, holdY, 45],
  };
}

const upperArm: LinkSpec = {
  id: 'upper-arm',
  name: 'Upper Arm',
  variant: 'c018',
  hornPlate: 2.5,
  link: (horn) => [
    flat([X0, HORN_Y, -14], [124, WIDTH, 2.5], [...horn(-14), ...pair(12).map((v) => ({ u: 114, v, r: 1.7 }))]),
    flat([X0, HORN_Y + 22.5, -14], [124, WIDTH, 2.5]),
    upright([X0, HORN_Y + 2.5, -14], [WIDTH, 20, 2.5]),
    upright([X0, HORN_Y + 2.5, 107.5], [WIDTH, 20, 2.5]),
    { origin: [X0, HORN_Y + 2.5, -11.5], u: [0, 1, 0], v: [0, 0, 1], size: [20, 119, 2.5] },
    { origin: [X0 + WIDTH - 2.5, HORN_Y + 2.5, -11.5], u: [0, 1, 0], v: [0, 0, 1], size: [20, 119, 2.5] },
  ],
  holds: pair(AXIS_X).map((x) => ({ at: [x, HORN_Y + 2.5, 100] as V3, shank: '-y' as const, length: 8 })),
  payload: [
    flat(
      [X0, HORN_Y - 15, 90],
      [20, WIDTH, 15],
      pair(12).map((v) => ({ u: 10, v, r: 1.25 })),
    ),
  ],
  payloadCom: [AXIS_X, HORN_Y - 8, 100],
};

export const QUADRUPED_LINKS = [thigh, uBracket('hip', 'Hip Bracket', 'c001', 3)];
export const SO101_LINKS = [upperArm, uBracket('shoulder', 'Shoulder Bracket', 'c018', 4)];
