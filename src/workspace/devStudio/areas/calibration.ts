import { replayErrors } from '../../../reality/jointReplay';
import { keepBenchLogs } from '../../../reality/benchLogStore';
import { unitHistories, withCalibration } from '../../../reality/projectCalibrations';
import { servoPartOf } from '../../../reality/servoPart';
import type { ServoCalibration, ServoLog } from '../../../reality/types';
import { selectedUnit } from '../../../robot/robotStore';
import type { Studio } from '../types';
import { fitBodyFor, setBodyRun } from '../../bodyActions';

export default function calibrationStudio(studio: Studio) {
  const project = () => studio().core.docs.projectRef.current;
  const histories = () => unitHistories(project(), selectedUnit());
  const calibrate = (jointId: string, calibration: ServoCalibration, logs?: ServoLog[]) => {
    const unit = selectedUnit();
    const recorded = logs ? { ...calibration, logId: keepBenchLogs(servoPartOf(calibration), logs) } : calibration;

    studio().core.docs.setProject((p) => withCalibration(p, jointId, recorded, unit));
  };

  return {
    calibrate,
    calibrationReplay: (jointId: string) => replayErrors(histories()[jointId]),
    calibrations: histories,
    setBodyRun,
    bodyCalibrations: () => project().bodyCalibrations ?? {},
    bodyChecks: async () => {
      const checked = await studio().core.readiness.checkNow();

      return (
        checked && {
          fingerprint: checked.fingerprint,
          checkedAt: checked.checkedAt,
          torque: checked.rows.find((row) => row.check === 'Servo torque'),
        }
      );
    },
    fitBody: (robot?: string) => fitBodyFor(studio().core, robot),
    bodyModel: (withoutBody = true) =>
      studio().core.simTraining.sim.buildModel({ withoutBody, calibrations: histories() }),
  };
}
