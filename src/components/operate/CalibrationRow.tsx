import React, { useRef, useState } from 'react';
import { confirmAction, IconButton, MenuItem, MoreIcon, PopoverMenu } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import type { CalibrationVerdict } from '../../reality/types';

const VERDICTS: Record<CalibrationVerdict, string> = {
  measured: 'Measured',
  consistent: 'Consistent with preset',
  'cant-tell': 'Can’t tell',
};

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

const RollBackMenu: React.FC<{ name: string; onRollBack: () => void }> = ({ name, onRollBack }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const rollBack = () => {
    setOpen(false);
    confirmAction({ title: `Roll back ${name}?`, confirmLabel: 'Roll Back', onConfirm: onRollBack });
  };

  return (
    <div
      ref={ref}
      className={`absolute right-0 top-0 h-8 flex items-center pl-8 pr-1 rounded-r-lg bg-gradient-to-r from-transparent to-[#333333] to-[32px] ${
        open
          ? 'opacity-100'
          : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
      }`}
    >
      <IconButton
        icon={<MoreIcon className="w-4 h-4" />}
        title="More"
        size="xs"
        isToggled={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      <PopoverMenu isOpen={open} onClose={() => setOpen(false)} ignoreRef={ref} position="bottom" align="end">
        <MenuItem label="Roll Back" onSelect={rollBack} />
      </PopoverMenu>
    </div>
  );
};

export const CalibrationRow: React.FC<CalibrationRowProps> = ({ jointId, name, history, onRollBack }) => {
  const verdict = history.versions.at(-1)?.verdict;
  const version = versionLabel(history, verdict);

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
      {history.active !== null && <RollBackMenu name={name} onRollBack={() => onRollBack(jointId)} />}
    </div>
  );
};
