import * as THREE from 'three';
import { toCad, type V3 } from '../agent/agentFrame';
import { specToPart, type AgentPartSpec } from '../agent/agentScene';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { prettyJointName } from '../utils/kinematics';
import { pieceCad, PRINTED_PIECES } from './actuatorCode';
import { DISC_BEARING, OUTPUT_BEARING } from './cycloidal';
import { cycloidalVariant } from './generated';
import { ENCODER_ID } from './motors';
import type { ActuatorChoice } from './pickActuator';

export interface ActuatorScene {
  parts: ScenePart[];
  joints: RobotJoint[];
}

export interface BuiltActuator extends ActuatorScene {
  motorId: string;
  added: ScenePart[];
  removed?: string;
}

interface Placed {
  key: string;
  spec: Omit<AgentPartSpec, 'id' | 'position' | 'rotation'>;
  at: THREE.Matrix4;
  output?: boolean;
}

const DEG = 180 / Math.PI;
const r2 = (v: number) => Math.round(v * 100) / 100 || 0;
const vec = (v: V3) => new THREE.Vector3(...v);

function poseOf(m: THREE.Matrix4): { position: V3; rotation: V3 } {
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');

  return { position: [r2(p.x), r2(p.y), r2(p.z)], rotation: [r2(e.x * DEG), r2(e.y * DEG), r2(e.z * DEG)] };
}

function spanAlong(parts: ScenePart[], ids: string[], axis: THREE.Vector3): [number, number] | null {
  const own = parts.filter((p) => ids.includes(p.id));

  if (!own.length) return null;

  const ts = own.flatMap((p) => {
    const half = [p.dimensions.width / 2, p.dimensions.height / 2, p.dimensions.depth / 2];
    const turn = new THREE.Euler(p.rotation[0] / DEG, p.rotation[1] / DEG, p.rotation[2] / DEG, 'XYZ');

    return [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const corner = new THREE.Vector3(
        k & 1 ? half[0] : -half[0],
        k & 2 ? half[1] : -half[1],
        k & 4 ? half[2] : -half[2],
      );
      const world = corner.applyEuler(turn).add(new THREE.Vector3(...p.position));

      return vec(toCad([world.x, world.y, world.z])).dot(axis);
    });
  });

  return [Math.min(...ts), Math.max(...ts)];
}

function outboard(parts: ScenePart[], origin: THREE.Vector3, axis: THREE.Vector3): number {
  const middle = parts.reduce((s, p) => s.add(vec(toCad(p.position))), new THREE.Vector3()).divideScalar(parts.length);

  return origin.clone().sub(middle).dot(axis) < -1 ? -1 : 1;
}

function actuatorFrame(scene: ActuatorScene, joint: RobotJoint, servo: ScenePart | undefined, stageH: number) {
  const origin = vec(toCad(joint.origin));
  const axis = vec(toCad(joint.axis)).normalize();
  const outputSide = servo && joint.child.includes(servo.id) ? joint.parent : joint.child;
  const side = outboard(scene.parts, origin, axis);
  const span = spanAlong(
    scene.parts,
    outputSide.filter((id) => id !== servo?.id),
    axis,
  );
  const along = origin.dot(axis);
  const edge = span?.[side > 0 ? 1 : 0] ?? along;
  const z = axis.clone().multiplyScalar(-side);
  const hint = Math.abs(z.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const x = hint.clone().addScaledVector(z, -hint.dot(z)).normalize();
  const y = z.clone().cross(x);
  const face = origin.clone().addScaledVector(axis, edge - along + side * stageH);

  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(face);
}

const BUTTON_HEAD = 2.2;
const MOTOR_SEAT = 4.8 - BUTTON_HEAD;
const M3_HEAD = 3;
const M3_INSERT = 5.7;
const COVER_SCREW = 14;

const seated = (seat: number, length: number, head: number) => seat - length / 2 + head / 2;

const offset = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

const ring = (count: number, radius: number, startDeg: number, z: number) =>
  Array.from({ length: count }, (_, k) => {
    const a = (startDeg + (360 * k) / count) / DEG;

    return offset(radius * Math.cos(a), radius * Math.sin(a), z);
  });

function placements(choice: ActuatorChoice): Placed[] {
  const { design: d, motor, driver } = choice;
  const reach = d.pinCircleR + 2 * d.ecc - d.pinD / 2 - d.fit;
  const coverR = (reach + 0.5 + d.housingD / 2) / 2;
  const printed = PRINTED_PIECES.map(({ piece, name }) => ({
    key: piece,
    spec: { name, shape: 'cad_part', material: 'printed' as const, cad: pieceCad(d, motor, piece) },
    at: offset(0, 0, 0),
    output: piece === 'output',
  }));
  const bought = (key: string, catalog: string, at: THREE.Matrix4): Placed => ({ key, spec: { catalog }, at });
  const discMid = (k: number) => 5 + k * (d.discT + d.gap) + d.discT / 2;

  return [
    bought('motor', `component:${motor.componentId}|${choice.variant}`, offset(0, 0, -motor.faceInMesh)),
    bought(
      'driver',
      `component:${driver.componentId}`,
      offset(0, 0, -(motor.bodyMm + motor.rearShaftMm + driver.thicknessMm / 2)),
    ),
    bought('encoder', `component:${ENCODER_ID}`, offset(d.camD / 2 + 7 + 12.7, 0, d.stageH - 1 + 2.3)),
    ...printed,
    bought('bearing-1', `hardware:bearing|${DISC_BEARING}`, offset(d.ecc, 0, discMid(0))),
    bought('bearing-2', `hardware:bearing|${DISC_BEARING}`, offset(-d.ecc, 0, discMid(1))),
    bought('bearing-3', `hardware:bearing|${OUTPUT_BEARING}`, offset(0, 0, d.housingH + 3.5)),
    ...ring(motor.faceBolts.count, motor.faceBolts.circleMm / 2, 45, seated(MOTOR_SEAT, 8, BUTTON_HEAD)).map((at, k) =>
      bought(`motor-screw-${k + 1}`, `hardware:button_head|M${motor.faceBolts.m}|8`, at),
    ),
    ...ring(6, coverR, 30, seated(d.stageH - 1, COVER_SCREW, M3_HEAD)).map((at, k) =>
      bought(`cover-screw-${k + 1}`, `hardware:socket_head|M3|${COVER_SCREW}`, at),
    ),
    ...ring(6, coverR, 30, d.housingH - M3_INSERT / 2).map((at, k) =>
      bought(`insert-${k + 1}`, 'hardware:heat_insert|M3', at),
    ),
  ];
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base,
    n = 1;

  while (taken.has(id)) id = `${base}-${++n}`;

  taken.add(id);

  return id;
}

const swapIn = (list: string[], gone: string | undefined, ids: string[]) =>
  gone && list.includes(gone) ? list.flatMap((id) => (id === gone ? ids : [id])) : list;

interface Rewire {
  gone?: string;
  stator: string[];
  output: string[];
}

const withStator = (list: string[], { gone, stator }: Rewire) =>
  gone && list.includes(gone) ? swapIn(list, gone, stator) : [...list, ...stator];

function rewireTarget(j: RobotJoint, ids: Rewire): RobotJoint {
  const statorOnChild = !!ids.gone && j.child.includes(ids.gone);

  return {
    ...j,
    parent: statorOnChild ? [...j.parent, ...ids.output] : withStator(j.parent, ids),
    child: statorOnChild ? withStator(j.child, ids) : [...j.child, ...ids.output],
    actuators: [ids.stator[0]],
  };
}

function rewire(joints: RobotJoint[], target: RobotJoint, ids: Rewire): RobotJoint[] {
  return joints.map((j) =>
    j.id === target.id
      ? rewireTarget(j, ids)
      : { ...j, parent: swapIn(j.parent, ids.gone, ids.stator), child: swapIn(j.child, ids.gone, ids.stator) },
  );
}

const isGenerated = (p: ScenePart) => !!p.componentId && !!cycloidalVariant(p.componentId, p.componentVariant ?? '');

function withoutOld(scene: ActuatorScene, servo: ScenePart | undefined): ActuatorScene {
  const groupId = servo && isGenerated(servo) ? servo.group?.id : undefined;

  if (!groupId) return scene;

  const gone = new Set(scene.parts.filter((p) => p.group?.id === groupId && p.id !== servo?.id).map((p) => p.id));
  const keep = (ids: string[]) => ids.filter((id) => !gone.has(id));

  return {
    parts: scene.parts.filter((p) => !gone.has(p.id)),
    joints: scene.joints.map((j) => ({ ...j, parent: keep(j.parent), child: keep(j.child) })),
  };
}

export function buildActuator(current: ActuatorScene, jointId: string, choice: ActuatorChoice): BuiltActuator | null {
  const target = current.joints.find((j) => j.id === jointId);

  if (!target || target.type !== 'revolute') return null;

  const servo = current.parts.find((p) => p.id === target.actuators?.[0]);
  const scene = withoutOld(current, servo);
  const joint = scene.joints.find((j) => j.id === jointId)!;
  const frame = actuatorFrame(scene, joint, servo, choice.design.stageH);
  const taken = new Set(scene.parts.filter((p) => p.id !== servo?.id).map((p) => p.id));
  const group = { id: uniqueId(`${joint.id}-actuator`, taken), name: `${prettyJointName(joint.name)} actuator` };
  const added = placements(choice).map((place) => {
    const id = uniqueId(`${joint.id}-${place.key}`, taken);
    const part = { ...specToPart({ ...place.spec, id, ...poseOf(frame.clone().multiply(place.at)) }), group };

    return { part: part.cad ? { ...part, cad: { ...part.cad, pending: true } } : part, output: !!place.output };
  });
  const stator = added.filter((a) => !a.output).map((a) => a.part.id);
  const output = added.filter((a) => a.output).map((a) => a.part.id);
  const kept = servo ? scene.parts.filter((p) => p.id !== servo.id) : scene.parts;

  return {
    parts: [...kept, ...added.map((a) => a.part)],
    joints: rewire(scene.joints, joint, { gone: servo?.id, stator, output }),
    motorId: stator[0],
    added: added.map((a) => a.part),
    ...(servo ? { removed: servo.id } : {}),
  };
}
