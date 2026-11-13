import type { MjcfInput } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { BENCH_SERVOS } from './bench';
import type { ServoCalibration, ServoFamily } from './types';

export function servoFamilyOf(joint: RobotJoint | undefined, parts: readonly ScenePart[]): ServoFamily | null {
  const servo = joint?.actuators?.map((id) => parts.find((p) => p.id === id)).find((p) => p?.componentId);
  const match = Object.entries(BENCH_SERVOS).find(
    ([, s]) => s.componentId === servo?.componentId && (!s.variant || s.variant === servo.componentVariant),
  );

  return (match?.[0] as ServoFamily | undefined) ?? null;
}

export function calibratedInput(input: MjcfInput, calibrations: Record<string, ServoCalibration>): MjcfInput {
  const applied = Object.entries(calibrations).filter(
    ([jointId, c]) =>
      c.verdict === 'measured' &&
      servoFamilyOf(
        input.project.joints?.find((j) => j.id === jointId),
        input.parts,
      ) === c.family,
  );

  if (!applied.length) return input;

  return {
    ...input,
    servoFits: {
      ...input.servoFits,
      ...Object.fromEntries(applied.map(([id, c]) => [id, { fit: c.fit, volts: c.volts }])),
    },
  };
}
