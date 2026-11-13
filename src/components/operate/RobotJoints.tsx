import React, { useState } from 'react';
import { SectionHeader } from '../../design-system';
import type { JointRow as JointRowModel } from '../../robot/jointRows';
import { JointRow } from './JointRow';
import type { ReplayChoice } from './JointRowMenu';

interface RobotJointsProps {
  rows: JointRowModel[];
  live: boolean;
  onRollBack?: (jointId: string) => void;
}

export const RobotJoints: React.FC<RobotJointsProps> = ({ rows, live, onRollBack }) => {
  const [replay, setReplay] = useState<ReplayChoice | null>(null);

  if (!rows.length) return null;

  return (
    <div className="mb-3">
      <SectionHeader title="Emulated servos" />
      {rows.map((row) => (
        <JointRow key={row.busId} row={row} live={live} replay={replay} onReplay={setReplay} onRollBack={onRollBack} />
      ))}
    </div>
  );
};
