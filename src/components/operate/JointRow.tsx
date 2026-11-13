import React from 'react';
import { confirmAction, IconButton, MetaLine, RowActions, UndoIcon } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import type { CalibrationVerdict } from '../../reality/types';
import type { JointRow as JointRowModel } from '../../robot/jointRows';
import { radiansFromCounts, type JointStatus } from '../../robot/robotState';

const VERDICTS: Record<CalibrationVerdict, string> = {
  measured: 'Measured',
  consistent: 'Consistent with preset',
  'cant-tell': 'Can’t tell',
};

const REPLIES: Record<string, string> = {
  missing: 'No reply',
  garbled: 'Garbled reply',
  wrong_id: 'Wrong ID answered',
};

const ROLL_BACK = 'Roll Back';

const degrees = (counts: number) => ((radiansFromCounts(counts) * 180) / Math.PI).toFixed(1);

function versionLabel(history: CalibrationHistory, verdict: CalibrationVerdict | undefined) {
  if (history.active !== null) return `v${history.active}`;

  return verdict === 'consistent' ? null : 'Preset';
}

function Reading({ reading }: { reading: JointStatus | null }) {
  const position = reading?.position;

  if (reading?.reply !== 'ok' || typeof position !== 'number')
    return <span className="shrink-0 text-white/50">{REPLIES[reading?.reply ?? 'missing'] ?? 'No reply'}</span>;

  return (
    <span className="shrink-0 flex items-baseline gap-[12px] tabular-nums text-white/90">
      <span>
        {degrees(position)}
        <span className="text-white/50">°</span>
      </span>
      {typeof reading.temp_c === 'number' && (
        <span className="text-white/50">
          {reading.temp_c.toFixed(0)}
          <span> °C</span>
        </span>
      )}
    </span>
  );
}

function Calibration({ history }: { history: CalibrationHistory }) {
  const verdict = history.versions.at(-1)?.verdict;
  const version = versionLabel(history, verdict);

  return (
    <MetaLine
      className="text-[12px] text-white/50"
      items={[verdict && VERDICTS[verdict], version && <span className="tabular-nums text-white/90">{version}</span>]}
    />
  );
}

function RollBack({ jointId, name, onRollBack }: { jointId: string; name: string; onRollBack: (id: string) => void }) {
  const rollBack = () =>
    confirmAction({ title: `Roll back ${name}?`, confirmLabel: ROLL_BACK, onConfirm: () => onRollBack(jointId) });

  return (
    <RowActions fill="#333333" className="right-0 inset-y-0 pr-1 rounded-r-lg">
      <IconButton icon={<UndoIcon className="w-4 h-4" />} title={ROLL_BACK} size="xs" onClick={rollBack} />
    </RowActions>
  );
}

const rowData = ({ busId, joint, reading, history }: JointRowModel, calibrated: boolean) => ({
  'data-robot-joint': busId,
  'data-position': reading?.position ?? '',
  'data-calibration-joint': calibrated ? joint?.id : undefined,
  'data-verdict': history?.versions.at(-1)?.verdict ?? '',
  'data-version': history?.active ?? 0,
});

interface JointRowProps {
  row: JointRowModel;
  live: boolean;
  onRollBack?: (jointId: string) => void;
}

export const JointRow: React.FC<JointRowProps> = ({ row, live, onRollBack }) => {
  const { busId, joint, reading, history } = row;

  return (
    <div
      {...rowData(row, Boolean(onRollBack))}
      className="group relative min-h-8 px-1 py-1.5 flex items-center justify-between gap-3 rounded-lg text-[13px] hover:bg-[#333333]"
    >
      <span className="min-w-0 flex flex-col">
        <span className="flex min-w-0 items-baseline gap-[8px]">
          {joint && <span className="min-w-0 truncate text-white/80">{joint.name}</span>}
          <span className="shrink-0 tabular-nums text-white/50">{busId}</span>
        </span>
        {history && <Calibration history={history} />}
      </span>
      {live && <Reading reading={reading} />}
      {joint && onRollBack && Boolean(history?.active) && (
        <RollBack jointId={joint.id} name={joint.name} onRollBack={onRollBack} />
      )}
    </div>
  );
};
