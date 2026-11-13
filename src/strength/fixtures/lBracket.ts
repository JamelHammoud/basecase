import * as THREE from 'three';
import type { HardwareSpec } from '../../data/hardware';
import type { ProjectSettings, RobotJoint, ScenePart } from '../../types/robotics';
import { sceneBuilder, type V3 } from './build';

const HORN_Y = 18.35;
const AXIS_X = -12.5;
const PLATE_X = AXIS_X - 12;
const EDGE_X = AXIS_X + 12;
const Z0 = -12;
const G = 9.81;
const screwOf = (length: number): HardwareSpec => ({ type: 'socket_head', size: 'M3', length });
const HORN_HOLES: Array<[number, number]> = [
  [AXIS_X + 7, 0],
  [AXIS_X - 7, 0],
  [AXIS_X, 7],
  [AXIS_X, -7],
];

export const L_BRACKET = 'l-bracket';
export const L_BRACKET_NAME = 'L Bracket';
export const ACROSS_THE_BEND: V3 = [-1, 0, 0];
export const ON_ITS_SIDE: V3 = [0, 0, -1];
export const LOAD_NM = 0.4 * 19.5 * 0.0980665;

export interface LBracketOptions {
  thickness?: number;
  height?: number;
  length?: number;
  reach?: number;
  down?: V3;
}

const HORIZONTAL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

export function lBracketScene(o: LBracketOptions = {}) {
  const { thickness: t = 3, height = 40, length = 34, reach = 16, down = ACROSS_THE_BEND } = o;
  const b = sceneBuilder(HORIZONTAL);
  const holdY = HORN_Y + height - 6;
  const holdZs = [reach - 6, reach + 6];
  const bracket = b.printed(
    L_BRACKET,
    L_BRACKET_NAME,
    [
      {
        origin: [PLATE_X, HORN_Y, Z0],
        u: [0, 0, 1],
        v: [1, 0, 0],
        size: [length, EDGE_X - PLATE_X, t],
        holes: HORN_HOLES.map(([x, z]) => ({ u: z - Z0, v: x - PLATE_X, r: 1.7 })),
      },
      {
        origin: [EDGE_X, HORN_Y, Z0],
        u: [0, 1, 0],
        v: [0, 0, 1],
        size: [height, length, t],
        holes: holdZs.map((z) => ({ u: holdY - HORN_Y, v: z - Z0, r: 1.7 })),
      },
    ],
    { print: { down } },
  );
  const loadX = EDGE_X + t;
  const lever = Math.hypot(loadX + 8 - AXIS_X, reach);
  const payload = b.printed(
    'payload',
    'Payload',
    [
      {
        origin: [loadX, holdY - 8, Z0],
        u: [0, 1, 0],
        v: [0, 0, 1],
        size: [16, length, 16],
        holes: holdZs.map((z) => ({ u: 8, v: z - Z0, r: 1.25 })),
      },
    ],
    { massG: Math.round((LOAD_NM / (G * (lever / 1000))) * 1000), com: b.point([loadX + 8, holdY, reach]) },
  );
  const hornScrews = HORN_HOLES.map(([x, z], i) =>
    b.screw(`horn-screw-${i + 1}`, screwOf(t + 3), { at: [x, HORN_Y + t, z], shank: '-y' }),
  );
  const holdScrews = holdZs.map((z, i) =>
    b.screw(`hold-screw-${i + 1}`, screwOf(t + 7), { at: [EDGE_X, holdY, z], shank: '+x' }),
  );
  const servo = b.servo('shoulder-servo', 'Feetech STS3215', [0, 0, 0]);
  const parts: ScenePart[] = [servo, bracket, payload, ...hornScrews, ...holdScrews];
  const joint: RobotJoint = {
    id: 'shoulder',
    name: 'Shoulder pitch',
    type: 'revolute',
    parent: [servo.id],
    child: [bracket.id, payload.id, ...hornScrews.map((s) => s.id), ...holdScrews.map((s) => s.id)],
    actuators: [servo.id],
    origin: b.point([AXIS_X, HORN_Y, 0]),
    axis: b.point([0, 1, 0]),
    range: [-90, 90],
  };
  const project: ProjectSettings = { printer: 'default', material: 'PLA', infillPct: 15, joints: [joint] };

  return { parts, project };
}
