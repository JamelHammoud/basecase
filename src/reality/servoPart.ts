import { actuatorOf, type ActuatorBus } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { FamilyName, ServoPart } from './types';

export const FAMILY_SERVOS: Readonly<Record<FamilyName, ServoPart>> = Object.freeze({
  sts3215: { componentId: 'feetech-sts3215', variant: 'c001' },
  xl330: { componentId: 'dynamixel-xl330-m288' },
});

export type DaemonBus = Extract<ActuatorBus, 'feetech' | 'dynamixel'>;

const DAEMON_BUSES: readonly ActuatorBus[] = ['feetech', 'dynamixel'] satisfies DaemonBus[];

const STAND_INS: Readonly<Record<DaemonBus, ServoPart>> = Object.freeze({
  feetech: FAMILY_SERVOS.sts3215,
  dynamixel: FAMILY_SERVOS.xl330,
});

export const servoPartOf = (named: { servo: ServoPart } | { family: FamilyName }): ServoPart =>
  'servo' in named ? named.servo : FAMILY_SERVOS[named.family];

export const sameServo = (a: ServoPart, b: ServoPart) =>
  a.componentId === b.componentId && (a.variant ?? null) === (b.variant ?? null);

export const servoName = (servo: ServoPart) =>
  servo.variant ? `${servo.componentId} ${servo.variant}` : servo.componentId;

const partServo = (part: ScenePart | undefined): ServoPart | null => {
  if (!part?.componentId || !actuatorOf(part.componentId, part.componentVariant)) return null;

  return { componentId: part.componentId, ...(part.componentVariant ? { variant: part.componentVariant } : {}) };
};

export function jointServo(joint: RobotJoint | undefined, parts: readonly ScenePart[]): ServoPart | null {
  const servos = (joint?.actuators ?? []).map((id) => partServo(parts.find((p) => p.id === id)));

  return servos.find((s) => s !== null) ?? null;
}

export const busOf = (servo: ServoPart) => actuatorOf(servo.componentId, servo.variant)?.bus;

export const offTheBus = (servo: ServoPart | null) => {
  const bus = servo ? busOf(servo) : undefined;

  return servo !== null && (bus === undefined || !DAEMON_BUSES.includes(bus));
};

export interface BenchServoInput {
  joint: RobotJoint | undefined;
  parts: readonly ScenePart[];
  bus: DaemonBus;
}

export function benchServo({ joint, parts, bus }: BenchServoInput): ServoPart | null {
  const servo = jointServo(joint, parts);

  if (offTheBus(servo)) return null;

  return servo ?? STAND_INS[bus];
}

export function calibratable(joint: RobotJoint | undefined, parts: readonly ScenePart[]): boolean {
  const servo = jointServo(joint, parts);

  return servo !== null && !offTheBus(servo);
}
