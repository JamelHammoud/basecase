import * as THREE from 'three';
import type { Case } from '../../cases/schema';
import type { V3 } from '../../utils/kinematics';
import type { ScenePart } from '../../types/robotics';
import type { State } from '../../skills/contract';
import type { FixtureRobot } from './parts';

export const PASSIVE_VARIANTS = [
  'nominal',
  'limp',
  'locked',
  'weak',
  'short',
  'resisted',
  'reversed',
  'rotated',
] as const;

export type PassiveVariant = (typeof PASSIVE_VARIANTS)[number];

const TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const turn = (point: V3): V3 => new THREE.Vector3(...point).applyQuaternion(TURN).toArray() as V3;

function rotation(euler: V3): V3 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler.map(THREE.MathUtils.degToRad)));
  const rotated = new THREE.Euler().setFromQuaternion(TURN.clone().multiply(q));

  return [rotated.x, rotated.y, rotated.z].map(THREE.MathUtils.radToDeg) as V3;
}

function turnScene(kase: Case, robot: FixtureRobot) {
  const part = <T extends Pick<ScenePart, 'position' | 'rotation'>>(value: T): T => ({
    ...value,
    position: turn(value.position),
    rotation: rotation(value.rotation),
  });

  kase.world.objects = kase.world.objects.map((object) => ({
    ...part(object),
    ...(object.joint
      ? { joint: { ...object.joint, origin: turn(object.joint.origin), axis: turn(object.joint.axis) } }
      : {}),
  }));
  kase.reference.timeline = kase.reference.timeline.map((command) =>
    command.target ? { ...command, target: turn(command.target) } : command,
  );

  const slot = kase.slot!;

  if (slot.anchor) slot.anchor = turn(slot.anchor);

  if (slot.binding.endEffector) slot.binding.endEffector.point = turn(slot.binding.endEffector.point);

  return {
    ...robot,
    parts: robot.parts.map(part),
    joints: robot.joints.map((joint) => ({ ...joint, origin: turn(joint.origin), axis: turn(joint.axis) })),
  };
}

function reversedTravel(state: State): State {
  if ('all' in state) return { all: state.all.map(reversedTravel) };

  if (!('atom' in state) || !('signal' in state.atom.expr) || state.atom.expr.signal !== 'fixture-travel') return state;

  return { atom: { ...state.atom, cmp: '<', value: -state.atom.value } };
}

function reverseFixture(kase: Case) {
  const joint = kase.world.objects.find((object) => object.joint)!.joint!;
  const success = kase.task.contract.success;

  if (!('hold_for' in success)) throw new Error('Fixture travel needs a hold contract.');

  joint.axis = joint.axis.map((n) => -n) as V3;
  joint.range = [-joint.range[1], 0];
  success.hold_for.state = reversedTravel(success.hold_for.state);
}

export function passiveVariant(authored: Case, arm: FixtureRobot, variant: PassiveVariant) {
  const kase = structuredClone(authored);
  const joint = kase.world.objects.find((object) => object.joint)!.joint!;
  let robot = arm;

  if (variant === 'locked') joint.locked = true;

  if (variant === 'resisted') {
    joint.frictionloss = 1000;
    joint.damping = 1000;
  }

  if (variant === 'weak') robot = { ...arm, joints: arm.joints.map((j) => ({ ...j, effortNm: 0.00001 })) };

  if (variant === 'rotated') robot = turnScene(kase, robot);

  if (variant === 'reversed') reverseFixture(kase);

  const passed = ['nominal', 'short', 'reversed', 'rotated'].includes(variant);

  return { kase, robot, passed, controller: variant === 'limp' ? ('limp' as const) : ('reference' as const) };
}
