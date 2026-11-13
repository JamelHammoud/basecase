import React from 'react';
import { MetaLine } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { benchLogOf } from '../../reality/jointReplay';
import type { CalibrationVerdict } from '../../reality/types';
import type { JointRow as JointRowModel } from '../../robot/jointRows';
import { radiansFromCounts, type JointStatus } from '../../robot/robotState';
import { JointReplayPlot } from './JointReplayPlot';
import { hasJointRowMenu, JointRowMenu, type ReplayChoice } from './JointRowMenu';

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

const rowData = ({ busId, joint, reading, history }: JointRowModel, calibrated: boolean) => ({
  'data-robot-joint': busId,
  'data-position': reading?.position ?? '',
  'data-calibration-joint': calibrated ? joint?.id : undefined,
  'data-verdict': history?.versions.at(-1)?.verdict ?? '',
  'data-version': history?.active ?? 0,
});

function JointLabel({ row: { busId, joint, history } }: { row: JointRowModel }) {
  return (
    <span className="min-w-0 flex flex-col">
      <span className="flex min-w-0 items-baseline gap-[8px]">
        {joint && <span className="min-w-0 truncate text-white/80">{joint.name}</span>}
        <span className="shrink-0 tabular-nums text-white/50">{busId}</span>
      </span>
      {history && <Calibration history={history} />}
    </span>
  );
}

function replayState(row: JointRowModel, replay: ReplayChoice | null) {
  const jointId = row.joint?.id ?? '';
  const open = Boolean(row.joint) && replay?.jointId === jointId;

  return {
    jointId,
    open,
    shown: open ? (replay?.version ?? null) : null,
    replayable: Boolean(row.history && benchLogOf(row.history)),
  };
}

interface JointRowProps {
  row: JointRowModel;
  live: boolean;
  replay: ReplayChoice | null;
  onReplay: (choice: ReplayChoice | null) => void;
  onRollBack?: (jointId: string) => void;
}

export const JointRow: React.FC<JointRowProps> = ({ row, live, replay, onReplay, onRollBack }) => {
  const { joint, reading, history } = row;
  const { jointId, open, shown, replayable } = replayState(row, replay);
  const menu = joint && history && onRollBack && hasJointRowMenu(history);

  return (
    <>
      <div
        {...rowData(row, Boolean(onRollBack))}
        className={`group relative rounded-lg text-[13px] hover:bg-[#333333] ${open ? 'bg-[#333333]' : ''}`}
      >
        <button
          type="button"
          disabled={!replayable}
          aria-expanded={replayable ? open : undefined}
          onClick={() => onReplay(open ? null : { jointId, version: null })}
          className="w-full min-h-8 px-1 py-1.5 flex items-center justify-between gap-3 text-left cursor-default"
        >
          <JointLabel row={row} />
          {live && <Reading reading={reading} />}
        </button>
        {menu && (
          <JointRowMenu
            name={joint.name}
            history={history}
            drawn={shown ?? history.active}
            onShow={(version) => onReplay({ jointId, version })}
            onRollBack={() => onRollBack(jointId)}
          />
        )}
      </div>
      {open && history && <JointReplayPlot history={history} version={shown} />}
    </>
  );
};
