import { Vector3 } from 'three';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { partBounds } from '../utils/selection';
import type { V3 } from '../utils/kinematics';
import { selectedPickGeometryProblem, selectedPickSpan } from '../cases/selectedPick';
import { assertFingerDimensions, readFinger, readMount } from './dimensions';
import { fingerFrame } from './frames';
import type { FingerDimensions, FingerPart, FingerReference } from './types';
import { assertFingerSweep, assertMatchingFingers, fingerOpening } from './motion';
import { assertFingerAttachments } from './attachments';

export function driverObstacles(parts: ScenePart[], finger: FingerPart): string[] {
  const mount = parts.find((part) => part.id === finger.gripperFinger.mount);
  const dimensions = readFinger(finger);

  if (!mount || !dimensions) throw new Error('Restore the declared finger mount and geometry.');

  const frame = fingerFrame(mount);
  const points = [0, 1].flatMap((hole) =>
    [-19, -25, -31, -37, -43].map((x) => frame.at([x, -dimensions.height / 2 + (hole - 0.5) * dimensions.spacing, 0])),
  );
  const own = new Set([
    mount.id,
    ...parts.filter((part) => part.gripperFinger?.mount === mount.id).map((part) => part.id),
  ]);

  return parts
    .filter(
      (part) =>
        !own.has(part.id) &&
        part.role === 'solid' &&
        !part.physics?.dynamic &&
        points.some((point) => {
          const bounds = partBounds(part);

          return point.every((value, axis) => value >= bounds.min[axis] - 4 && value <= bounds.max[axis] + 4);
        }),
    )
    .map((part) => part.id);
}

export function validateFingerAssembly(parts: ScenePart[], joints?: RobotJoint[]) {
  const fingers = parts.filter((part): part is FingerPart => part.gripperFinger?.role === 'finger');

  if (!parts.some((part) => part.gripperFinger)) return;

  if (fingers.length !== 2) throw new Error('Keep both replacement fingers and their references together.');

  for (const finger of fingers) validateFinger(parts, finger, joints);

  assertMatchingFingers(fingers);

  const opening = fingerOpening(fingers, parts);

  for (const finger of fingers) {
    validateOpening(parts, finger, opening);
    assertFingerSweep(parts, finger);
  }
}

function validateFinger(parts: ScenePart[], finger: FingerPart, joints?: RobotJoint[]) {
  const reference = finger.gripperFinger;
  const mount = parts.find((part) => part.id === reference.mount);
  const target = parts.find((part) => part.id === reference.target);
  const dimensions = readFinger(finger);
  const mounting = mount && readMount(mount);

  if (!mount || !target || !dimensions || !mounting || selectedPickGeometryProblem(target))
    throw new Error('Restore the selected object and declared M3 finger interface.');

  assertFingerDimensions(dimensions);

  if (
    ['height', 'depth', 'spacing'].some(
      (name) => dimensions[name as keyof FingerDimensions] !== mounting[name as keyof typeof mounting],
    )
  )
    throw new Error('Keep both fingers and their mounting dimensions linked.');

  assertJoint(joints, reference);
  assertFingerAttachments(parts, finger, joints);

  if (driverObstacles(parts, finger).length) throw new Error('Clear the M3 screw driver paths before fitting fingers.');
}

function assertJoint(joints: RobotJoint[] | undefined, reference: FingerReference) {
  if (!joints) return;

  const joint = joints.find((item) => item.id === reference.joint);

  if (
    !joint ||
    joint.type !== 'prismatic' ||
    JSON.stringify(joint.range) !== JSON.stringify(reference.travel) ||
    JSON.stringify(joint.axis) !== JSON.stringify(reference.axis)
  )
    throw new Error('Fit the fingers again after changing jaw travel or axes.');
}

function validateOpening(parts: ScenePart[], finger: FingerPart, gripper: ReturnType<typeof fingerOpening>) {
  const dimensions = readFinger(finger)!;
  const target = parts.find((part) => part.id === finger.gripperFinger.target)!;
  const width = selectedPickSpan(target, gripper.across);
  const protrusion = 16 - 10 - dimensions.thickness - 0.5;
  const carrierGap = gripper.closedOpeningMm - 2 * dimensions.clearance;

  if (
    carrierGap < Math.max(5, protrusion * 2 + 1) ||
    width <= gripper.closedOpeningMm + dimensions.v * 2 ||
    width + 0.2 >= gripper.openingMm
  )
    throw new Error('Fit the finger opening, screw tips and full jaw travel around the selected object.');

  const inward = fingerFrame(parts.find((part) => part.id === finger.gripperFinger.mount)!).direction([1, 0, 0]);

  if (Math.abs(new Vector3(...inward).dot(new Vector3(...finger.gripperFinger.axis).normalize())) < 0.999)
    throw new Error('Align the declared mounting face with the jaw slide axis.');
}

export function fingerObstacles(parts: ScenePart[], selectedTargets: string[] = []): ScenePart[] {
  const targets = new Set([
    ...selectedTargets,
    ...parts.flatMap((part) => (part.gripperFinger ? [part.gripperFinger.target] : [])),
  ]);

  return parts.map((part) => {
    if (part.gripperFinger || readMount(part) || targets.has(part.id)) return part;

    const bounds = partBounds(part);

    return {
      id: part.id,
      name: part.name,
      category: 'structure',
      role: part.role,
      visible: part.visible,
      locked: part.locked,
      color: part.color,
      physics: part.physics,
      massG: part.massG,
      note: '',
      kind: 'box',
      position: bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2) as V3,
      rotation: [0, 0, 0],
      dimensions: {
        width: bounds.max[0] - bounds.min[0],
        height: bounds.max[1] - bounds.min[1],
        depth: bounds.max[2] - bounds.min[2],
      },
    };
  });
}
