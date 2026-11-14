import * as THREE from 'three';
import type { V3 } from '../agent/agentFrame';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { actuatorParts, type ActuatorFrame } from './actuatorParts';
import { levels, type CycloidalDesign } from './cycloidal';

export interface ActuatorEdit {
  parts: ScenePart[];
  joints: RobotJoint[];
  motor: string;
}

export interface ActuatorScene {
  parts: ScenePart[];
  joints: RobotJoint[];
}

const vec = (v: V3) => new THREE.Vector3(...v);

const mean = (points: THREE.Vector3[]) =>
  points.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, points.length));

function inward(scene: ActuatorScene, origin: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  const center = mean(scene.parts.map((p) => vec(p.position)));
  const along = center.sub(origin).dot(axis);

  return Math.abs(along) < 1 ? axis : axis.clone().multiplyScalar(Math.sign(along));
}

function basisFor(z: THREE.Vector3): THREE.Matrix4 {
  const helper = Math.abs(z.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const x = helper.clone().cross(z).normalize();
  const y = z.clone().cross(x).normalize();

  return new THREE.Matrix4().makeBasis(x, y, z);
}

function reach(part: ScenePart, from: THREE.Vector3, dir: THREE.Vector3): number {
  const turn = new THREE.Euler(...(part.rotation.map((v) => THREE.MathUtils.degToRad(v)) as V3));
  const { width, height, depth } = part.dimensions;

  return Math.max(
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
      new THREE.Vector3(
        k & 1 ? width / 2 : -width / 2,
        k & 2 ? height / 2 : -height / 2,
        k & 4 ? depth / 2 : -depth / 2,
      )
        .applyEuler(turn)
        .add(vec(part.position))
        .sub(from)
        .dot(dir),
    ),
  );
}

function frameFor(scene: ActuatorScene, joint: RobotJoint, servo: ScenePart, design: CycloidalDesign): ActuatorFrame {
  const axis = vec(joint.axis).normalize();
  const onAxis = vec(joint.origin).addScaledVector(axis, vec(servo.position).sub(vec(joint.origin)).dot(axis));
  const out = inward(scene, onAxis, axis);
  const outside = out.clone().negate();
  const child = scene.parts.filter((p) => p.id !== servo.id && joint.child.includes(p.id));
  const flush = Math.max(0, ...child.map((p) => reach(p, onAxis, outside)));

  return {
    origin: onAxis.addScaledVector(outside, flush + levels(design).out).toArray() as V3,
    basis: basisFor(out),
  };
}

const swap = (ids: string[], from: string, to: string[]) =>
  ids.includes(from) ? [...ids.filter((id) => id !== from), ...to] : ids;

function rewired(
  joints: RobotJoint[],
  target: RobotJoint,
  servo: string,
  made: { fixed: string[]; output: string; motor: string; gearTrain: string[] },
) {
  const fixed = [made.motor, ...made.fixed];

  return joints.map((j) => {
    const parts = { parent: swap(j.parent, servo, fixed), child: swap(j.child, servo, fixed) };
    const frame = j.frame?.part === servo ? { frame: { ...j.frame, part: made.motor } } : {};

    if (j.id !== target.id) return { ...j, ...parts, ...frame };

    return {
      ...j,
      ...frame,
      parent: [...new Set([...parts.parent, ...fixed])],
      child: [...parts.child.filter((id) => !fixed.includes(id)), made.output],
      actuators: [made.motor],
      gearTrain: made.gearTrain,
    };
  });
}

export function withActuator(
  scene: ActuatorScene,
  jointId: string,
  design: CycloidalDesign,
  base: string,
): ActuatorEdit | string {
  const joint = scene.joints.find((j) => j.id === jointId);
  const servo = joint?.actuators?.length === 1 ? scene.parts.find((p) => p.id === joint.actuators![0]) : undefined;

  if (!joint || joint.type !== 'revolute') return `${jointId} isn’t a revolute joint.`;

  if (!servo) return `${joint.name} has no single servo to replace.`;

  const made = actuatorParts(design, frameFor(scene, joint, servo, design), base);
  const group = { id: base, name: `${joint.name} actuator` };
  const added = [made.motor, ...made.fixed, made.output].map((p) => ({ ...p, group }));
  const ids = {
    motor: made.motor.id,
    output: made.output.id,
    fixed: made.fixed.map((p) => p.id),
    gearTrain: made.gearTrain,
  };

  return {
    parts: [...scene.parts.filter((p) => p.id !== servo.id), ...added],
    joints: rewired(scene.joints, joint, servo.id, ids),
    motor: made.motor.id,
  };
}
