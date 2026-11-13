import React from 'react';
import type { CalibrationHistory } from '../../reality/history';
import { replayable } from '../../reality/replayClient';
import type { CalibrationVerdict } from '../../reality/types';
import { CalibrationRowActions } from './CalibrationRowActions';

const VERDICTS: Record<CalibrationVerdict, string> = {
  measured: 'Measured',
  consistent: 'Consistent with preset',
  'cant-tell': 'Can’t tell',
};

interface CalibrationRowProps {
  jointId: string;
  name: string;
  history: CalibrationHistory;
  open: boolean;
  shown: number | null;
  onToggle: (jointId: string) => void;
  onShowVersion: (jointId: string, version: number) => void;
  onRollBack: (jointId: string) => void;
}

function versionLabel(history: CalibrationHistory, verdict: CalibrationVerdict | undefined) {
  if (history.active !== null) return `v${history.active}`;

  return verdict === 'consistent' ? null : 'Preset';
}

const fromAction = (e: React.SyntheticEvent) => Boolean((e.target as HTMLElement).closest('button'));

export const CalibrationRow: React.FC<CalibrationRowProps> = (props) => {
  const { jointId, name, history, open, shown, onToggle, onShowVersion, onRollBack } = props;
  const verdict = history.versions.at(-1)?.verdict;
  const version = versionLabel(history, verdict);
  const canOpen = replayable(history);
  const toggle = (e: React.SyntheticEvent) => {
    if (canOpen && !fromAction(e)) onToggle(jointId);
  };

  return (
    <div
      data-calibration-joint={jointId}
      data-verdict={verdict ?? ''}
      data-version={history.active ?? 0}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-expanded={canOpen ? open : undefined}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') toggle(e);
      }}
      className={`group relative h-8 px-1 flex items-center justify-between gap-3 rounded-lg text-[13px] hover:bg-[#333333] ${open ? 'bg-[#333333]' : ''}`}
    >
      <span className="min-w-0 truncate text-white/80">{name}</span>
      <span className="shrink-0 flex items-baseline gap-[12px] text-white/50">
        {verdict && <span>{VERDICTS[verdict]}</span>}
        {version && <span className="tabular-nums text-white/90">{version}</span>}
      </span>
      <CalibrationRowActions
        name={name}
        history={history}
        shown={shown}
        onShowVersion={(v) => onShowVersion(jointId, v)}
        onRollBack={() => onRollBack(jointId)}
      />
    </div>
  );
};
