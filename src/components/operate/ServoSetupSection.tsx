import React from 'react';
import { Button } from '../../design-system';
import type { RobotState } from '../../robot/robotState';
import { canSetUpServos, useServoSetup } from '../../robot/servoSetup';
import type { RobotJoint } from '../../types/robotics';

const CURRENT_ROW = 'bg-[color-mix(in_srgb,#0d99ff_18%,var(--color-panel-bg))]';

interface ServoSetupSectionProps {
  robot: RobotState;
  joints: RobotJoint[];
  onSetUp: () => void;
}

export const ServoSetupSection: React.FC<ServoSetupSectionProps> = ({ robot, joints, onSetUp }) => {
  const setup = useServoSetup();

  if (setup) {
    const { step } = setup;

    return (
      <div className="mb-3" data-testid="servo-setup">
        {step && (
          <div
            data-servo-setup-step={step.id}
            data-joint={step.jointId}
            className={`h-[32px] px-1 flex items-center justify-between gap-3 rounded-lg text-[13px] ${CURRENT_ROW}`}
          >
            <span className="min-w-0 truncate text-white">{step.name}</span>
            <span className="shrink-0 tabular-nums text-white/90">{step.id}</span>
          </div>
        )}
      </div>
    );
  }

  if (!canSetUpServos(joints, robot)) return null;

  return (
    <Button variant="secondary" fullWidth className="mb-3" onClick={onSetUp}>
      Set Up Servos
    </Button>
  );
};
