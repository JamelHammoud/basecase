import React from 'react';
import { Button, CheckIcon, SectionHeader } from '../../design-system';
import { ladderFor, rungEnabled, type RobotMode, type RobotState } from '../../robot/robotState';
import { enterRung } from '../../robot/robotStore';

const RUNGS: Record<RobotMode, { label: string; hint: string }> = {
  look: { label: 'Look', hint: 'Read the emulated servos with motors off' },
  set_up: { label: 'Set Up', hint: 'Check every emulated servo answers' },
  test: { label: 'Test', hint: 'Move each emulated joint slowly' },
  rehearse: { label: 'Rehearse', hint: 'Run the policy with emulated motors off' },
  first_run: { label: 'First Run', hint: 'Run the policy on emulated motors' },
  policy: { label: 'Policy', hint: 'Run the policy longer on emulated motors' },
  longer_runs: { label: 'Longer Runs', hint: 'Run without a time limit on emulated motors' },
};

export const rungLabel = (mode: RobotMode) => RUNGS[mode].label;

export const RobotLadder: React.FC<{ robot: RobotState }> = ({ robot }) => (
  <div className="mb-3" data-testid="robot-mode" data-mode={robot.mode}>
    <SectionHeader title="Ladder" />
    {ladderFor(robot.spec).map((rung) => {
      const current = robot.mode === rung;

      return (
        <Button
          key={rung}
          data-robot-rung={rung}
          variant={current ? 'secondary' : 'ghost'}
          fullWidth
          className="justify-between! mb-[2px]"
          disabled={current || !rungEnabled(robot, rung)}
          title={RUNGS[rung].hint}
          tooltipSide="right"
          iconRight={current ? <CheckIcon className="w-4 h-4" /> : undefined}
          onClick={() => void enterRung(rung)}
        >
          {RUNGS[rung].label}
        </Button>
      );
    })}
  </div>
);
