import React, { useState } from 'react';
import { NumberInput } from '../../design-system';
import type { RobotJoint } from '../../types/robotics';
import { jointRange, jointUnit } from '../../utils/kinematics';

export const JointRangeFields: React.FC<{
  joint: RobotJoint;
  onChange: (range: [number, number], live?: boolean) => void;
}> = ({ joint, onChange }) => {
  const [[lo, hi], setRange] = useState(() => jointRange(joint));
  const unit = jointUnit(joint);
  const change = (next: [number, number], live?: boolean) => {
    setRange(next);
    onChange(next, live);
  };

  return (
    <div className="grid grid-cols-2 gap-2 p-1">
      <NumberInput aria-label="Min" unit={unit} value={lo} max={hi} onChange={(v, live) => change([v, hi], live)} />
      <NumberInput aria-label="Max" unit={unit} value={hi} min={lo} onChange={(v, live) => change([lo, v], live)} />
    </div>
  );
};
