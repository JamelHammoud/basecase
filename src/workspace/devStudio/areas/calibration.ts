import { replayErrors } from '../../../reality/jointReplay';
import { unitHistories, withCalibration } from '../../../reality/projectCalibrations';
import type { ServoCalibration } from '../../../reality/types';
import { selectedUnit } from '../../../robot/robotStore';
import type { Studio } from '../types';

export default function calibrationStudio(studio: Studio) {
  const project = () => studio().core.docs.projectRef.current;
  const histories = () => unitHistories(project(), selectedUnit());
  const calibrate = (jointId: string, calibration: ServoCalibration) => {
    const unit = selectedUnit();

    studio().core.docs.setProject((p) => withCalibration(p, jointId, calibration, unit));
  };

  return {
    calibrate,
    calibrationReplay: (jointId: string) => replayErrors(histories()[jointId]),
    calibrations: histories,
  };
}
