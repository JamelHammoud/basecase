import * as THREE from 'three';
import { actuatorOf } from '../data/components';
import { findPort, worldPort } from '../agent/ports';
import type { RobotJoint, RobotPoseState } from '../types/robotics';
import { clampJoint, type Rig, type V3 } from '../utils/kinematics';
import { loopValue } from '../utils/kinematicsLoop';
import { closure, toRadians } from '../utils/linkageKinematics';
import { toMj } from './mjcfFrames';
import { esc, vec } from './mjcfText';
import type { SimBody } from './mjcfTypes';

interface PhysicalLoop {
  driver: RobotJoint;
  coupler: RobotJoint;
  rocker: RobotJoint;
  pin: V3;
}

function refuse(): never {
  throw new Error('Repair the four-bar joints or insert the Sketch Path again before simulating.');
}

function closedAt(joint: Pick<RobotJoint, 'loop'>, value: number) {
  const l = joint.loop!.fourBar;
  const at = closure(l, toRadians(l.theta + value));

  if (
    !at ||
    ![l.ground, l.crank, l.coupler, l.rocker, l.theta].every(Number.isFinite) ||
    [l.ground, l.crank, l.coupler, l.rocker].some((n) => n <= 0)
  )
    refuse();

  const area = Math.abs((at.c[0] - at.b[0]) * at.c[1] - (at.c[1] - at.b[1]) * (at.c[0] - l.ground));

  if (area / (l.coupler * l.rocker) < 1e-4) refuse();

  return at;
}

function physicalLoop(rig: Rig, driverId: string): PhysicalLoop {
  const driver = rig.byId.get(driverId);
  const members = rig.joints.filter((j) => j.loop?.driver === driverId);
  const coupler = members.find((j) => j.loop!.link === 'coupler');
  const rocker = members.find((j) => j.loop!.link === 'rocker');

  if (!driver || driver.type !== 'revolute' || !coupler || !rocker || members.length !== 2) refuse();

  validateCrank(rig, driver);

  const l = coupler.loop!.fourBar;

  validateMembers({ rig, driver, members, coupler, rocker });

  const a = new THREE.Vector3(...driver.origin);
  const u = new THREE.Vector3(...rocker.origin).sub(a);
  const n = new THREE.Vector3(...driver.axis);

  if (Math.abs(u.length() - l.ground) > 0.05 || Math.abs(n.length() - 1) > 1e-4 || Math.abs(u.dot(n)) > 0.05) refuse();

  u.normalize();

  const v = new THREE.Vector3().crossVectors(n, u);
  const at = closedAt(coupler, 0);
  const b = a.clone().addScaledVector(u, at.b[0]).addScaledVector(v, at.b[1]);

  if (b.distanceTo(new THREE.Vector3(...coupler.origin)) > 0.05) refuse();

  if (members.some((j) => new THREE.Vector3(...j.axis).distanceTo(n) > 1e-4)) refuse();

  const expected = a.addScaledVector(u, at.c[0]).addScaledVector(v, at.c[1]);
  const pin = closingPin(rig, coupler);
  const other = closingPin(rig, rocker);
  const offset = new THREE.Vector3(...pin).sub(expected);

  offset.addScaledVector(n, -offset.dot(n));

  if (offset.length() > 0.05 || new THREE.Vector3(...pin).distanceTo(new THREE.Vector3(...other)) > 0.05) refuse();

  return { driver, coupler, rocker, pin };
}

export function physicalLoops(rig: Rig): PhysicalLoop[] {
  const drivers = new Set(rig.joints.flatMap((j) => (j.loop ? [j.loop.driver] : [])));

  return [...drivers].map((driver) => physicalLoop(rig, driver));
}

export function loopHinge(joint: RobotJoint, local: RobotPoseState, rig: Rig): { joint: RobotJoint; initial: number } {
  const driver = rig.byId.get(joint.loop!.driver)!;
  const value = clampJoint(driver, local.values[driver.id] ?? 0);

  return {
    joint: { ...joint, type: 'revolute', actuation: 'passive', range: undefined },
    initial: checkedLoopValue(joint, value),
  };
}

export function loopEquality(loops: PhysicalLoop[], bodies: SimBody[]): string[] {
  return loops.map(({ coupler, rocker, pin }) => {
    const first = bodies.find((b) => b.joint === coupler.id);
    const second = bodies.find((b) => b.joint === rocker.id);

    if (!first || !second) refuse();

    const local = pin.map((v, i) => v - first.origin[i]) as V3;

    return `    <connect body1="${esc(first.name)}" body2="${esc(second.name)}" anchor="${vec(toMj(local))}" solref="0.004 1"/>`;
  });
}

function closingPin(rig: Rig, joint: RobotJoint): V3 {
  const candidates = joint.child.flatMap((id) => {
    const part = rig.parts.find((p) => p.id === id);
    const port = part && findPort(part, 'C');

    return part && port ? [worldPort(part, port).position] : [];
  });

  if (candidates.length !== 1) refuse();

  return candidates[0];
}

function validateCrank(rig: Rig, driver: RobotJoint) {
  const servos = driver.actuators?.map((id) => rig.parts.find((p) => p.id === id)) ?? [];

  if (
    driver.actuation !== 'passive' &&
    (!servos.length || servos.some((p) => !p?.componentId || !actuatorOf(p.componentId, p.componentVariant)))
  )
    throw new Error('Choose the crank servo variant before simulating the four-bar.');
}

export function checkedLoopValue(joint: Pick<RobotJoint, 'loop'>, value: number): number {
  closedAt(joint, value);

  return loopValue(joint, value);
}

function validateMembers({
  rig,
  driver,
  members,
  coupler,
  rocker,
}: {
  rig: Rig;
  driver: RobotJoint;
  members: RobotJoint[];
  coupler: RobotJoint;
  rocker: RobotJoint;
}) {
  const l = coupler.loop!.fourBar;

  if (Object.keys(l).some((key) => l[key as keyof typeof l] !== rocker.loop!.fourBar[key as keyof typeof l])) refuse();

  const coordinates = [driver, coupler, rocker].flatMap((joint) => [...joint.origin, ...joint.axis]);

  if (!coordinates.every(Number.isFinite)) refuse();

  const base = rig.parentOf.get(driver.id);

  if (rig.parentOf.get(coupler.id) !== driver.id || rig.parentOf.get(rocker.id) !== base) refuse();

  if (members.some((j) => j.type !== 'fixed' || j.actuators?.length || !j.child.length)) refuse();
}
