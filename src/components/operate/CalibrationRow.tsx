import React, { useRef, useState } from 'react';
import { confirmAction, IconButton, MenuDivider, MenuItem, MoreIcon, PopoverMenu } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { benchLogOf, measuredVersions } from '../../reality/jointReplay';
import type { CalibrationVerdict } from '../../reality/types';
import { JointReplayPlot } from './JointReplayPlot';

const VERDICTS: Record<CalibrationVerdict, string> = {
  measured: 'Measured',
  consistent: 'Consistent with preset',
  'cant-tell': 'Can’t tell',
};

export interface ReplayChoice {
  jointId: string;
  version: number | null;
}

interface CalibrationRowProps {
  jointId: string;
  name: string;
  history: CalibrationHistory;
  replay: ReplayChoice | null;
  onReplay: (choice: ReplayChoice | null) => void;
  onRollBack: (jointId: string) => void;
}

function versionLabel(history: CalibrationHistory, verdict: CalibrationVerdict | undefined) {
  if (history.active !== null) return `v${history.active}`;

  return verdict === 'consistent' ? null : 'Preset';
}

interface RowMenuProps {
  name: string;
  history: CalibrationHistory;
  drawn: number | null;
  onShow: (version: number) => void;
  onRollBack: () => void;
}

const RowMenu: React.FC<RowMenuProps> = ({ name, history, drawn, onShow, onRollBack }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const versions = benchLogOf(history) ? [...measuredVersions(history)].reverse() : [];

  const rollBack = () => {
    setOpen(false);
    confirmAction({ title: `Roll back ${name}?`, confirmLabel: 'Roll Back', onConfirm: onRollBack });
  };

  const show = (version: number) => {
    setOpen(false);
    onShow(version);
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
        {versions.map((c) => (
          <MenuItem
            key={c.version}
            label={`v${c.version}`}
            checked={c.version === drawn}
            onSelect={() => show(c.version)}
          />
        ))}
        {versions.length > 0 && history.active !== null && <MenuDivider />}
        {history.active !== null && <MenuItem label="Roll Back" onSelect={rollBack} />}
      </PopoverMenu>
    </div>
  );
};

const hasMenu = (history: CalibrationHistory) =>
  history.active !== null || (Boolean(benchLogOf(history)) && measuredVersions(history).length > 0);

export const CalibrationRow: React.FC<CalibrationRowProps> = ({
  jointId,
  name,
  history,
  replay,
  onReplay,
  onRollBack,
}) => {
  const verdict = history.versions.at(-1)?.verdict;
  const version = versionLabel(history, verdict);
  const open = replay?.jointId === jointId;
  const shown = open ? (replay?.version ?? null) : null;
  const drawn = shown ?? history.active;
  const replayable = Boolean(benchLogOf(history));

  return (
    <>
      <div
        data-calibration-joint={jointId}
        data-verdict={verdict ?? ''}
        data-version={history.active ?? 0}
        className={`group relative h-8 rounded-lg text-[13px] hover:bg-[#333333] ${open ? 'bg-[#333333]' : ''}`}
      >
        <button
          type="button"
          disabled={!replayable}
          aria-expanded={replayable ? open : undefined}
          onClick={() => onReplay(open ? null : { jointId, version: null })}
          className="w-full h-full px-1 flex items-center justify-between gap-3 text-left cursor-default"
        >
          <span className="min-w-0 truncate text-white/80">{name}</span>
          <span className="shrink-0 flex items-baseline gap-[12px] text-white/50">
            {verdict && <span>{VERDICTS[verdict]}</span>}
            {version && <span className="tabular-nums text-white/90">{version}</span>}
          </span>
        </button>
        {hasMenu(history) && (
          <RowMenu
            name={name}
            history={history}
            drawn={drawn}
            onShow={(shown) => onReplay({ jointId, version: shown })}
            onRollBack={() => onRollBack(jointId)}
          />
        )}
      </div>
      {open && <JointReplayPlot history={history} version={shown} />}
    </>
  );
};
