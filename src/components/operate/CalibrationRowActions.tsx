import React, { useState } from 'react';
import { confirmAction, IconButton, RowActions, UndoIcon } from '../../design-system';
import { measuredVersions, type CalibrationHistory } from '../../reality/history';
import { replayable } from '../../reality/replayClient';
import { VersionMenu } from './VersionMenu';

const ROLL_BACK = 'Roll Back';

interface CalibrationRowActionsProps {
  name: string;
  history: CalibrationHistory;
  shown: number | null;
  onShowVersion: (version: number) => void;
  onRollBack: () => void;
}

export const CalibrationRowActions: React.FC<CalibrationRowActionsProps> = ({
  name,
  history,
  shown,
  onShowVersion,
  onRollBack,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const versions = replayable(history) ? measuredVersions(history) : [];
  const canRollBack = history.active !== null;
  const rollBack = () => confirmAction({ title: `Roll back ${name}?`, confirmLabel: ROLL_BACK, onConfirm: onRollBack });

  if (!canRollBack && versions.length < 2) return null;

  return (
    <RowActions fill="#333333" shown={menuOpen} className="right-0 inset-y-0 pr-1 rounded-r-lg">
      {versions.length > 1 && (
        <VersionMenu
          versions={versions}
          shown={shown ?? history.active}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onChoose={onShowVersion}
        />
      )}
      {canRollBack && (
        <IconButton icon={<UndoIcon className="w-4 h-4" />} title={ROLL_BACK} size="xs" onClick={rollBack} />
      )}
    </RowActions>
  );
};
