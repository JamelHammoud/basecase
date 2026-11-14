import * as THREE from 'three';
import { add, matrixToEuler, r3, rotate, type V3 } from '../agent/agentFrame';
import { specToPart } from '../agent/agentScene';
import type { AgentCadPayload } from '../agent/cadMesh';
import { COMPONENT_BY_ID, componentSize } from '../data/components';
import { cycloidalVariantId } from '../data/generatedActuators';
import { hardwareDimensions, makeSpec } from '../data/hardware';
import { BEARINGS } from '../data/motionHardware';
import type { ScenePart } from '../types/robotics';
import {
  BEARING_SIZES,
  cycloidalCode,
  levels,
  motorOf,
  partExtent,
  POST_ANGLES,
  postRadius,
  type CycloidalDesign,
  type PrintedPart,
} from './cycloidal';

export interface ActuatorFrame {
  origin: V3;
  basis: THREE.Matrix4;
}

const CAD_TO_SCENE = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0),
);

export const PART_NAMES: Record<PrintedPart, string> = {
  housing: 'Housing',
  cap: 'Housing Cap',
  disc_a: 'Disc A',
  disc_b: 'Disc B',
  output: 'Output Ring',
  shaft: 'Input Shaft',
};

const BOX_TRIANGLES = [
  0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5,
];

const rotationOf = (frame: ActuatorFrame): V3 =>
  matrixToEuler(frame.basis.clone().multiply(CAD_TO_SCENE.clone().invert()));

const at = (frame: ActuatorFrame, p: V3): V3 =>
  new THREE.Vector3(...p)
    .applyMatrix4(frame.basis)
    .add(new THREE.Vector3(...frame.origin))
    .toArray()
    .map(r3) as V3;

function placeholder(design: CycloidalDesign, part: PrintedPart): AgentCadPayload {
  const { min, max } = partExtent(design, part);
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => [
    k & 1 ? max[0] : min[0],
    k & 2 ? max[1] : min[1],
    k & 4 ? max[2] : min[2],
  ]);

  return { language: 'openscad', code: cycloidalCode(design, part), positions: corners, indices: BOX_TRIANGLES };
}

function printedPart(id: string, design: CycloidalDesign, part: PrintedPart, frame: ActuatorFrame): ScenePart {
  const rotation = rotationOf(frame);
  const made = specToPart({
    id,
    name: PART_NAMES[part],
    shape: 'cad_part',
    material: 'printed',
    cad: placeholder(design, part),
  });

  return {
    ...made,
    rotation,
    position: add(frame.origin, rotate(made.cad!.originOffset, rotation)).map(r3) as V3,
    cad: { ...made.cad!, pending: true },
  };
}

function boughtPart(id: string, key: string, frame: ActuatorFrame, center: V3): ScenePart {
  return { ...specToPart({ id, catalog: key }), rotation: rotationOf(frame), position: at(frame, center) };
}

interface Bought {
  key: string;
  at: V3;
}

const headedAt = (key: string, seat: V3): Bought => {
  const [, size, length] = key.split('|');
  const spec = makeSpec(key.includes('heat_insert') ? 'heat_insert' : 'socket_head', { size, length: Number(length) });
  const H = hardwareDimensions(spec).height;
  const lift = key.includes('heat_insert') ? -H / 2 : H / 2 - Number(length);

  return { key, at: [seat[0], seat[1], seat[2] + lift] };
};

const polar = (r: number, deg: number, z: number): V3 => [
  r * Math.cos((deg * Math.PI) / 180),
  r * Math.sin((deg * Math.PI) / 180),
  z,
];

function hardware(design: CycloidalDesign): Bought[] {
  const z = levels(design);
  const motor = motorOf(design);
  const bearing = (size: string, p: V3): Bought => ({ key: `hardware:bearing|${size}`, at: p });
  const half = (size: string) => BEARINGS[size].B / 2;
  const motorScrew = `hardware:socket_head|M${motor.stator.m}|10`;
  const holes = Array.from(
    { length: motor.stator.holes },
    (_, i) => motor.stator.phase + (360 * i) / motor.stator.holes,
  );

  return [
    bearing(BEARING_SIZES.cam, [design.e, 0, z.discA + half(BEARING_SIZES.cam)]),
    bearing(BEARING_SIZES.cam, [-design.e, 0, z.discB + half(BEARING_SIZES.cam)]),
    bearing(BEARING_SIZES.shaft, [0, 0, z.cap + 0.5 + half(BEARING_SIZES.shaft)]),
    bearing(BEARING_SIZES.out, [0, 0, z.outBearing + half(BEARING_SIZES.out)]),
    ...holes.map((a) => headedAt(motorScrew, polar(motor.stator.pcd / 2, a, z.baseTop - motor.stator.m - 0.4))),
    ...POST_ANGLES.map((a) => headedAt('hardware:heat_insert|M3|5.7', polar(postRadius(design), a, z.cap))),
    ...POST_ANGLES.map((a) => headedAt('hardware:socket_head|M3|8', polar(postRadius(design), a, z.cap + 2.6))),
  ];
}

export interface ActuatorParts {
  motor: ScenePart;
  output: ScenePart;
  fixed: ScenePart[];
  gearTrain: string[];
}

const CAM_BEARINGS = 2;

export function actuatorParts(design: CycloidalDesign, frame: ActuatorFrame, base: string): ActuatorParts {
  const z = levels(design);
  const m = motorOf(design);
  const meshY = componentSize(design.motor).height;
  const driverY = componentSize(m.driver).height;
  const encoderY = componentSize(m.encoder).height;
  const variant = cycloidalVariantId(design.pins, design.lobes);
  const motor = boughtPart(`${base}-motor`, `component:${design.motor}|${variant}`, frame, [0, 0, -m.faceY]);
  const printed = (part: PrintedPart) => printedPart(`${base}-${part.replace('_', '-')}`, design, part, frame);
  const rear = -(m.faceY + meshY / 2 + driverY / 2);
  const train = (['disc_a', 'disc_b', 'shaft'] as const).map(printed);
  const bought = hardware(design).map((h, i) => boughtPart(`${base}-hw-${i + 1}`, h.key, frame, h.at));

  return {
    motor: { ...motor, name: COMPONENT_BY_ID[design.motor]?.name ?? motor.name },
    output: printed('output'),
    fixed: [
      ...(['housing', 'cap'] as const).map(printed),
      ...train,
      boughtPart(`${base}-driver`, `component:${m.driver}`, frame, [0, 0, rear]),
      boughtPart(`${base}-encoder`, `component:${m.encoder}`, frame, [0, 0, z.hub + 0.3 + encoderY / 2]),
      ...bought,
    ],
    gearTrain: [...train, ...bought.slice(0, CAM_BEARINGS)].map((p) => p.id),
  };
}
