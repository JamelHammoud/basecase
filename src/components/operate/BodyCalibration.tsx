import React, { useSyncExternalStore } from 'react';
import { Button, confirmAction } from '../../design-system';
import type { BodyHistory } from '../../reality/bodyTypes';
import { bodyEvidenceText, bodyFitPending, subscribeBodyFit } from '../../workspace/bodyActions';

export interface BodyCalibrationProps {
  robot: string;
  history: BodyHistory | undefined;
  onFit: () => void;
  onRollBack: () => void;
}

export const BodyCalibration: React.FC<BodyCalibrationProps> = ({ robot, history, onFit, onRollBack }) => {
  const pending = useSyncExternalStore(subscribeBodyFit, () => bodyFitPending(robot));
  const latest = history?.versions.at(-1);
  const rollback = () =>
    confirmAction({
      title: 'Roll back body?',
      confirmLabel: 'Roll Back',
      onConfirm: onRollBack,
    });

  return (
    <div className="mb-3 flex flex-col gap-2" data-testid="body-calibration" data-fitting={pending}>
      <Button variant="secondary" fullWidth disabled={pending} onClick={onFit}>
        {pending ? 'Fitting body…' : 'Fit Body'}
      </Button>
      {latest && <p className="px-1 text-[12px] text-white/50">{bodyEvidenceText(latest)}</p>}
      {history?.active != null && (
        <div className="flex items-center justify-between gap-2 px-1" data-body-version={history.active}>
          <span className="text-[12px] text-white/50">Body v{history.active}</span>
          <Button variant="ghost" size="xs" disabled={pending} onClick={rollback}>
            Roll Back
          </Button>
        </div>
      )}
    </div>
  );
};
