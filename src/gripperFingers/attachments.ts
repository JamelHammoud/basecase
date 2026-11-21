import { Quaternion, Euler, Vector3 } from 'three';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { fingerFrame } from './frames';
import { fingerHardware } from './hardware';
import { readFinger } from './dimensions';
import type { FingerPart } from './types';

const rotation = (part: ScenePart) =>
  new Quaternion().setFromEuler(new Euler(...part.rotation.map((value) => (value * Math.PI) / 180)));

function samePlacement(actual: ScenePart, expected: ScenePart): boolean {
  return (
    new Vector3(...actual.position).distanceTo(new Vector3(...expected.position)) < 0.01 &&
    rotation(actual).angleTo(rotation(expected)) < 0.0001
  );
}

function sameHardware(actual: ScenePart, expected: ScenePart): boolean {
  return (
    actual.kind === expected.kind &&
    actual.role === 'solid' &&
    JSON.stringify(actual.hardware) === JSON.stringify(expected.hardware) &&
    (['width', 'height', 'depth'] as const).every((axis) => actual.dimensions[axis] === expected.dimensions[axis]) &&
    !actual.mesh &&
    !actual.sculptMesh &&
    !actual.boolean &&
    !actual.csg &&
    !actual.deformers &&
    !actual.sheetTransform &&
    !actual.edges &&
    samePlacement(actual, expected)
  );
}

export function assertFingerAttachments(parts: ScenePart[], finger: FingerPart, joints?: RobotJoint[]) {
  const reference = finger.gripperFinger;
  const mount = parts.find((part) => part.id === reference.mount)!;
  const frame = fingerFrame(mount);
  const expected = { ...finger, position: frame.at(finger.cad!.originOffset), rotation: mount.rotation };
  const hardware = fingerHardware(mount, readFinger(finger)!, reference);
  const child = joints?.find((joint) => joint.id === reference.joint)?.child;
  const attached = [mount, finger, ...hardware];

  if (!samePlacement(finger, expected) || (child && attached.some((part) => !child.includes(part.id))))
    throw new Error('Restore the declared finger mount and geometry.');

  for (const expected of hardware) {
    const actual = parts.find((part) => part.id === expected.id);

    if (
      !actual ||
      !sameHardware(actual, expected) ||
      JSON.stringify(actual.gripperFinger) !== JSON.stringify(expected.gripperFinger)
    )
      throw new Error('Restore the selected object and declared M3 finger interface.');
  }
}
