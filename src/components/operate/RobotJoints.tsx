import React from 'react';
import { SectionHeader } from '../../design-system';
import type { JointRow as JointRowModel } from '../../robot/jointRows';
import { JointRow } from './JointRow';

interface RobotJointsProps {
  rows: JointRowModel[];
  live: boolean;
  onRollBack?: (jointId: string) => void;
  bare?: boolean;
}

export const RobotJoints: React.FC<RobotJointsProps> = ({ rows, live, onRollBack, bare }) =>
  rows.length > 0 && (
    <div className={bare ? '' : 'mb-3'}>
      {!bare && <SectionHeader title="Emulated servos" />}
      {rows.map((row) => (
        <JointRow key={row.busId} row={row} live={live} onRollBack={onRollBack} />
      ))}
    </div>
  );
