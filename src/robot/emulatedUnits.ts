import { presetServo } from '../reality/servoEstimate';
import { jointServo, offTheBus } from '../reality/servoPart';
import type { ServoPart } from '../reality/types';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { isServoAsk, type ConnectSpec, type EmulatedUnit } from './robotState';
import type { ConnectChoice } from './sceneRobot';

function unitOf(servo: ServoPart): EmulatedUnit {
  const { fit, volts } = presetServo(servo);

  return {
    volts,
    kt: fit.kt,
    resistance: fit.resistance,
    armature: fit.armature,
    friction: { ...fit.friction },
    firmwareKp: fit.firmwareKp,
    errorGain: fit.errorGain,
    errorGainRatio: fit.errorGainRatio,
    maxDuty: fit.maxDuty,
    maxVelocity: fit.maxVelocity ?? (fit.maxDuty * volts) / fit.kt,
    delayS: fit.delayS,
  };
}

function unitFor(joint: RobotJoint | undefined, parts: readonly ScenePart[]): EmulatedUnit | null {
  const servo = jointServo(joint, parts);

  return servo && !offTheBus(servo) ? unitOf(servo) : null;
}

export interface EmulatedSpecInput {
  choice: ConnectChoice;
  joints: readonly RobotJoint[];
  parts: readonly ScenePart[];
}

export function emulatedUnits({ choice, joints, parts }: EmulatedSpecInput): { units?: Array<EmulatedUnit | null> } {
  const units = choice.joints.map((id) =>
    unitFor(
      joints.find((j) => j.id === id),
      parts,
    ),
  );

  return units.some((u) => u !== null) ? { units } : {};
}

export function emulatedSpec(input: EmulatedSpecInput): ConnectSpec {
  const { spec } = input.choice;

  return isServoAsk(spec) ? { ...spec, ...emulatedUnits(input) } : spec;
}
