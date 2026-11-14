import React, { useState } from 'react';
import { Button, SegmentedControl } from '../../design-system';
import { FAMILY_NAMES } from '../../robot/robotFamilies';
import type { RobotFamily } from '../../robot/robotState';
import { emulatedSpec } from '../../robot/emulatedUnits';
import { connectRobot } from '../../robot/robotStore';
import { sceneRobotChoices } from '../../robot/sceneRobot';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import { PlayNoRobot } from '../PlayNoRobot';

interface ConnectRobotButtonProps {
  joints: RobotJoint[];
  parts: readonly ScenePart[];
  onShowRobots: () => void;
}

export const ConnectRobotButton: React.FC<ConnectRobotButtonProps> = ({ joints, parts, onShowRobots }) => {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [family, setFamily] = useState<RobotFamily | null>(null);
  const robot = sceneRobotChoices(joints);

  if (!joints.some((j) => j.type !== 'fixed')) return <PlayNoRobot onShowRobots={onShowRobots} />;

  if (!robot.ok) return null;

  const options = robot.choices.map((c) => ({ value: c.spec.family, label: FAMILY_NAMES[c.spec.family] }));
  const chosen = robot.choices.find((c) => c.spec.family === family) ?? robot.choices[0];

  const connect = async () => {
    const reply = await connectRobot(emulatedSpec({ choice: chosen, joints, parts }), chosen.joints);

    setRefusal(reply.ok ? null : reply.message);
  };

  return (
    <div className="mb-3">
      <div data-testid="robot-family" className="mb-2">
        <SegmentedControl options={options} value={chosen.spec.family} onChange={setFamily} />
      </div>
      <Button variant="primary" fullWidth onClick={() => void connect()}>
        Connect Emulated Robot
      </Button>
      {refusal && <p className="px-1 mt-2 text-[12.5px] text-white/50">{refusal}</p>}
    </div>
  );
};
