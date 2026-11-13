import React, { useState } from 'react';
import { NumberInput } from '../../design-system';
import { shownRange } from '../../joints/handJoint';
import type { RobotJoint } from '../../types/robotics';
import { jointUnit } from '../../utils/kinematics';

export const JointRangeFields: React.FC<{
  joint: RobotJoint;
  onChange: (range: [number, number], live?: boolean) => void;
}> = ({ joint, onChange }) => {
  const [[lo, hi], setShown] = useState(() => shownRange(joint));
  const unit = jointUnit(joint);
  const change = (range: [number, number], live?: boolean) => {
    setShown(range);
    onChange(range, live);
  };

  return (
    <div className="grid grid-cols-2 gap-2 p-1 w-[200px]">
      <NumberInput
        aria-label="Lower limit"
        value={lo}
        unit={unit}
        max={hi}
        onChange={(v, live) => change([v, hi], live)}
      />
      <NumberInput
        aria-label="Upper limit"
        value={hi}
        unit={unit}
        min={lo}
        onChange={(v, live) => change([lo, v], live)}
      />
    </div>
  );
};
