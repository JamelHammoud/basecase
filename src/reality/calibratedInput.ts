import type { MjcfInput } from '../sim/mjcfTypes';
import { calibrationApplies } from './measuredJoints';
import type { ServoCalibration } from './types';

export function calibratedInput(input: MjcfInput, calibrations: Record<string, ServoCalibration>): MjcfInput {
  const applied = Object.entries(calibrations).filter(([jointId, c]) =>
    calibrationApplies(
      c,
      input.project.joints?.find((j) => j.id === jointId),
      input.parts,
    ),
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
