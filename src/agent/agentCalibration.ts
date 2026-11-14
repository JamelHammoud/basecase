import { DEFAULT_UNIT } from '../../electron/robot/units.mjs';
import { replayErrors } from '../reality/jointReplay';
import { unitHistories } from '../reality/projectCalibrations';
import type { ProjectSettings } from '../types/robotics';
import { angleFromRadians as degrees } from '../utils/angle';

export async function calibrationErrorsText(project: ProjectSettings, unit: string = DEFAULT_UNIT): Promise<string> {
  const histories = unitHistories(project, unit);
  const rows = await Promise.all(
    (project.joints ?? []).map(async (joint) => {
      const errors = await replayErrors(histories[joint.id]);

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
