import { replayErrors } from '../reality/jointReplay';
import type { ProjectSettings } from '../types/robotics';

const degrees = (rad: number) => `${((rad * 180) / Math.PI).toFixed(2)}°`;

export async function calibrationErrorsText(project: ProjectSettings): Promise<string> {
  const rows = await Promise.all(
    (project.joints ?? []).map(async (joint) => {
      const errors = await replayErrors(project.servoCalibrations?.[joint.id]);

      if (!errors) return null;

      const calibrated =
        errors.calibrationErrorRad === null
          ? 'no calibration in use'
          : `${degrees(errors.calibrationErrorRad)} with calibration v${errors.version}`;

      return `${joint.name} ${degrees(errors.presetErrorRad)} with the preset, ${calibrated}`;
    }),
  );
  const found = rows.filter((row) => row !== null);

  return found.length ? `Bench log replayed in the sim, median error per joint: ${found.join('; ')}.` : '';
}
