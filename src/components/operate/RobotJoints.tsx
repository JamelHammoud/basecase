import React, { useState } from 'react';
import { SectionHeader } from '../../design-system';
import type { JointRow as JointRowModel } from '../../robot/jointRows';
import { useRobotTwin, type RobotTwin } from '../../robot/robotTwin';
import { JointRow } from './JointRow';
import type { ReplayChoice } from './JointRowMenu';

export interface JointCalibrate {
  disabled: boolean;
  onCalibrate: (jointId: string) => void;
}

interface RobotJointsProps {
  rows: JointRowModel[];
  live: boolean;
  measured?: ReadonlySet<string>;
  onRollBack?: (jointId: string) => void;
  calibrate?: JointCalibrate;
}

function twinGap(twin: RobotTwin | null, row: JointRowModel, index: number) {
  const k = row.joint ? (twin?.joints.indexOf(row.joint.id) ?? -1) : index;

  return { gap: twin?.gaps[k] ?? null, lagging: Boolean(row.joint && twin?.lagging.has(row.joint.id)) };
}

export const RobotJoints: React.FC<RobotJointsProps> = ({ rows, live, measured, onRollBack, calibrate }) => {
  const [replay, setReplay] = useState<ReplayChoice | null>(null);
  const twin = useRobotTwin();

  if (!rows.length) return null;

  return (
    <div className="mb-3">
      <SectionHeader title="Emulated servos" />
      {rows.map((row, i) => (
        <JointRow
          key={row.busId}
          row={row}
          live={live}
          measured={Boolean(row.joint && measured?.has(row.joint.id))}
          replay={replay}
          onReplay={setReplay}
          onRollBack={onRollBack}
          twin={live ? twinGap(twin, row, i) : null}
          calibrate={calibrate}
        />
      ))}
    </div>
  );
};
