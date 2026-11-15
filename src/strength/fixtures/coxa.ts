import * as THREE from 'three';
import { toCad } from '../../agent/agentFrame';
import type { Port } from '../../types/ports';
import type { ProjectSettings, RobotJoint, ScenePart } from '../../types/robotics';
import { sceneBuilder, type V3 } from './build';

export const COXA = 'coxa-bracket';
export const COXA_NAME = 'Coxa bracket';
export const COXA_JOINT = 'hip';

const HORN_Y = 18.35;
const AXIS_X = -12.5;
const THICKNESS = 6;
const HORN_HOLES: Array<[number, number]> = [
  [AXIS_X + 7, 0],
  [AXIS_X - 7, 0],
  [AXIS_X, 7],
  [AXIS_X, -7],
];
const HOLD_HOLES: Array<[number, number]> = [
  [49, -7],
  [49, 7],
];

export function coxaScene(length = 84) {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  const b = sceneBuilder(turn);
  const holes = [...HORN_HOLES, ...HOLD_HOLES];
  const ports: Port[] = holes.map(([x, z], i) => ({
    name: i < HORN_HOLES.length ? `horn-${i + 1}` : `femur-${i - HORN_HOLES.length + 1}`,
    kind: 'bore',
    position: toCad(b.point([x, HORN_Y + THICKNESS / 2, z])),
    axis: toCad(b.point([0, 1, 0])),
    diameterMm: 3.4,
    depthMm: THICKNESS,
  }));
  const bracket = b.printed(
    COXA,
    COXA_NAME,
    [
      {
        origin: [-26.5, HORN_Y, -15],
        u: [0, 0, 1],
        v: [1, 0, 0],
        size: [30, length, THICKNESS],
        holes: holes.map(([x, z]) => ({ u: z + 15, v: x + 26.5, r: 1.7 })),
      },
    ],
    { print: { down: b.point([0, -1, 0]) }, mechanicalTag: '3D Printed PLA/PETG' },
  );

  bracket.cad = { ...bracket.cad!, ports };
  bracket.mates = [{ port: 'horn-1', target: 'hip-servo', targetPort: 'horn-1', type: 'coaxial' }];

  const payload = b.printed(
    'femur-load',
    'Femur load',
    [
      {
        origin: [40, HORN_Y - 10, -15],
        u: [0, 0, 1],
        v: [1, 0, 0],
        size: [30, 18, 10],
        holes: HOLD_HOLES.map(([x, z]) => ({ u: z + 15, v: x - 40, r: 1.25 })),
      },
    ],
    { massG: 150, com: b.point([49, HORN_Y - 5, 0]), print: { down: b.point([0, -1, 0]) } },
  );
  const hornScrews = HORN_HOLES.map(([x, z], i) =>
    b.screw(
      `horn-screw-${i + 1}`,
      { type: 'socket_head', size: 'M3', length: THICKNESS + 3 },
      {
        at: [x, HORN_Y + THICKNESS, z],
        shank: '-y',
      },
    ),
  );
  const holdScrews = HOLD_HOLES.map(([x, z], i) =>
    b.screw(
      `femur-screw-${i + 1}`,
      { type: 'socket_head', size: 'M3', length: THICKNESS + 6 },
      {
        at: [x, HORN_Y + THICKNESS, z],
        shank: '-y',
      },
    ),
  );
  const servo = b.servo('hip-servo', 'Feetech STS3215', [0, 0, 0]);
  const parts: ScenePart[] = [servo, bracket, payload, ...hornScrews, ...holdScrews];
  const joint: RobotJoint = {
    id: COXA_JOINT,
    name: 'Coxa pitch',
    type: 'revolute',
    parent: [servo.id],
    child: [bracket.id, payload.id, ...hornScrews.map((p) => p.id), ...holdScrews.map((p) => p.id)],
    actuators: [servo.id],
    origin: b.point([AXIS_X, HORN_Y, 0]),
    axis: b.point([0, 1, 0]) as V3,
    range: [-60, 60],
  };
  const project: ProjectSettings = { printer: 'default', material: 'PLA', infillPct: 15, joints: [joint] };

  return { parts, project };
}
