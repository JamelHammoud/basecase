import React from 'react';
import { confirmAction, IconButton, RowActions, UndoIcon } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import type { CalibrationVerdict } from '../../reality/types';

const VERDICTS: Record<CalibrationVerdict, string> = {
  measured: 'Measured',
  consistent: 'Consistent with preset',
  'cant-tell': 'Can’t tell',
};

const ROLL_BACK = 'Roll Back';

interface CalibrationRowProps {
  jointId: string;
  name: string;
  history: CalibrationHistory;
  onRollBack: (jointId: string) => void;
}

function versionLabel(history: CalibrationHistory, verdict: CalibrationVerdict | undefined) {
  if (history.active !== null) return `v${history.active}`;

  return verdict === 'consistent' ? null : 'Preset';
}

export const CalibrationRow: React.FC<CalibrationRowProps> = ({ jointId, name, history, onRollBack }) => {
  const verdict = history.versions.at(-1)?.verdict;
  const version = versionLabel(history, verdict);
  const rollBack = () =>
    confirmAction({ title: `Roll back ${name}?`, confirmLabel: ROLL_BACK, onConfirm: () => onRollBack(jointId) });

  return (
    <div
      data-calibration-joint={jointId}
      data-verdict={verdict ?? ''}
      data-version={history.active ?? 0}
      className="group relative h-8 px-1 flex items-center justify-between gap-3 rounded-lg text-[13px] hover:bg-[#333333]"
    >
      <span className="min-w-0 truncate text-white/80">{name}</span>
      <span className="shrink-0 flex items-baseline gap-[12px] text-white/50">
        {verdict && <span>{VERDICTS[verdict]}</span>}
        {version && <span className="tabular-nums text-white/90">{version}</span>}
      </span>
      {history.active !== null && (
        <RowActions fill="#333333" className="right-0 inset-y-0 pr-1 rounded-r-lg">
          <IconButton icon={<UndoIcon className="w-4 h-4" />} title={ROLL_BACK} size="xs" onClick={rollBack} />
        </RowActions>
      )}
    </div>
  );
};
