import React, { useRef, useState } from 'react';
import {
  confirmAction,
  IconButton,
  MenuDivider,
  MenuItem,
  MoreIcon,
  PopoverMenu,
  RowActions,
} from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { benchLogOf, measuredVersions } from '../../reality/jointReplay';

const ROLL_BACK = 'Roll Back';

export interface ReplayChoice {
  jointId: string;
  version: number | null;
}

interface JointRowMenuProps {
  name: string;
  history: CalibrationHistory;
  drawn: number | null;
  onShow: (version: number) => void;
  onRollBack: () => void;
}

export const hasJointRowMenu = (history: CalibrationHistory) =>
  history.active !== null || (Boolean(benchLogOf(history)) && measuredVersions(history).length > 0);

export const JointRowMenu: React.FC<JointRowMenuProps> = ({ name, history, drawn, onShow, onRollBack }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const versions = benchLogOf(history) ? [...measuredVersions(history)].reverse() : [];

  const rollBack = () => {
    setOpen(false);
    confirmAction({ title: `Roll back ${name}?`, confirmLabel: ROLL_BACK, onConfirm: onRollBack });
  };

  const show = (version: number) => {
    setOpen(false);
    onShow(version);
  };

  return (
    <RowActions fill="#333333" shown={open} className="right-0 inset-y-0 pr-1 rounded-r-lg">
      <div ref={ref} className="flex items-center">
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
          {history.active !== null && <MenuItem label={ROLL_BACK} onSelect={rollBack} />}
        </PopoverMenu>
      </div>
    </RowActions>
  );
};
