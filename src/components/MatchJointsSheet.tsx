import React, { useState } from 'react';
import { FileImportIcon, Modal, Select } from '../design-system';
import type { JointPairs } from '../datasets/import/jointMatch';
import { prettyJointName } from '../utils/kinematics';
import type { MatchSheet } from '../workspace/useDataImport';

const unlessTaken = (id: string | null, taken: string) => (id === taken ? null : id);

export const MatchJointsSheet: React.FC<{
  sheet: MatchSheet;
  onDone: (pairs: JointPairs | null) => void;
}> = ({ sheet, onDone }) => {
  const [joints, setJoints] = useState<JointPairs>(sheet.joints);
  const options = [
    { value: '', label: 'None' },
    ...sheet.targets.map((t) => ({ value: t.id, label: prettyJointName(t.label) })),
  ];

  const pick = (row: number, value: string) =>
    setJoints((now) => now.map((id, i) => (i === row ? value || null : unlessTaken(id, value))));

  return (
    <Modal
      isOpen
      onClose={() => onDone(null)}
      title="Match Joints"
      subtitle={sheet.source}
      icon={<FileImportIcon className="w-4 h-4" />}
      maxWidth="max-w-[520px]"
      action={{ label: 'Import', disabled: joints.every((id) => id === null), onClick: () => onDone(joints) }}
    >
      <div
        data-testid="match-joints"
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1.5 items-center max-h-[420px] overflow-y-auto"
      >
        {sheet.names.map((name, row) => (
          <React.Fragment key={name}>
            <span className="text-[13px] text-white/60 truncate">{name}</span>
            <Select
              aria-label={name}
              options={options}
              value={joints[row] ?? ''}
              onChange={(e) => pick(row, e.target.value)}
            />
          </React.Fragment>
        ))}
      </div>
    </Modal>
  );
};
