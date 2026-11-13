import { actuatorOf, type ActuatorSpec, type ServoFit } from '../data/components';
import { FAMILY_SERVOS } from './servoPart';
import type { ServoPart } from './types';

type MeasuredSpec = ActuatorSpec & { fit: ServoFit };

function measuredSpec(servo: ServoPart): MeasuredSpec {
  const spec = actuatorOf(servo.componentId, servo.variant);

  if (!spec?.fit) throw new Error(`The catalog ${servo.componentId} has no servo model`);

  return { ...spec, fit: spec.fit };
}

const referenceFor = (spec: ActuatorSpec) =>
  measuredSpec(spec.bus === 'dynamixel' ? FAMILY_SERVOS.xl330 : FAMILY_SERVOS.sts3215);

export function estimatedFit(spec: ActuatorSpec): ServoFit {
  const ref = referenceFor(spec);
  const torque = spec.stallNm / ref.stallNm;
  const speed = spec.rpm && ref.rpm ? spec.rpm / ref.rpm : 1;
  const volts = spec.atVolts / ref.atVolts;
  const gearing = volts / speed;
  const { fit } = ref;

  return {
    ...fit,
    volts: fit.volts * volts,
    kt: fit.kt * gearing,
    resistance: (fit.resistance * volts * gearing) / torque,
    armature: fit.armature * gearing ** 2,
    friction: {
      ...fit.friction,
      base: fit.friction.base * torque,
      stribeck: fit.friction.stribeck * torque,
      viscous: (fit.friction.viscous * torque) / speed,
    },
    ...(fit.maxVelocity ? { maxVelocity: fit.maxVelocity * speed } : {}),
    source: `${fit.source}, scaled to the catalog's stall torque, speed and volts`,
  };
}

export function presetServo(servo: ServoPart): { fit: ServoFit; volts: number } {
  const spec = actuatorOf(servo.componentId, servo.variant);

  if (!spec) throw new Error(`The catalog ${servo.componentId} has no servo spec`);

  return { fit: spec.fit ?? estimatedFit(spec), volts: spec.atVolts };
}
