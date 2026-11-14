import { replayErrors } from '../../../reality/jointReplay';
import { withCalibration } from '../../../reality/projectCalibrations';
import type { ServoCalibration } from '../../../reality/types';
import type { Studio } from '../types';

export default function calibrationStudio(studio: Studio) {
  const project = () => studio().core.docs.projectRef.current;

  return {
    calibrate: (jointId: string, calibration: ServoCalibration) =>
      studio().core.docs.setProject((p) => withCalibration(p, jointId, calibration)),
    calibrationReplay: (jointId: string) => replayErrors(project().servoCalibrations?.[jointId]),
    calibrations: () => project().servoCalibrations ?? {},
  };
}
