import React, { useState } from 'react';
import { confirmAction, ContextMenu, type ContextMenuEntry } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { benchLogOf, measuredVersions } from '../../reality/jointReplay';

const ROLL_BACK = 'Roll Back';

export interface ReplayChoice {
  jointId: string;
  version: number | null;
}

interface JointRowMenuOptions {
  name: string;
  history: CalibrationHistory;
  drawn: number | null;
  onShow: (version: number) => void;
  onRollBack: () => void;
}

export const hasJointRowMenu = (history: CalibrationHistory) =>
  history.active !== null || (Boolean(benchLogOf(history)) && measuredVersions(history).length > 0);

function menuEntries({ name, history, drawn, onShow, onRollBack }: JointRowMenuOptions): ContextMenuEntry[] {
  const versions: ContextMenuEntry[] = (benchLogOf(history) ? [...measuredVersions(history)].reverse() : []).map(
    (c) => ({ label: `v${c.version}`, checked: c.version === drawn, onSelect: () => onShow(c.version) }),
  );

  if (history.active === null) return versions;

  const rollBack = () => confirmAction({ title: `Roll back ${name}?`, confirmLabel: ROLL_BACK, onConfirm: onRollBack });

  return [
    ...versions,
    ...(versions.length ? [{ divider: true as const }] : []),
    { label: ROLL_BACK, onSelect: rollBack },
  ];
}

export function useJointRowMenu(options: JointRowMenuOptions | null) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  return {
    onContextMenu: options
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          setAt({ x: e.clientX, y: e.clientY });
        }
      : undefined,
    menu: options && at && <ContextMenu x={at.x} y={at.y} items={menuEntries(options)} onClose={() => setAt(null)} />,
  };
}
