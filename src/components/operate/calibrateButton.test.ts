import { describe, expect, it } from 'vitest';
import { INITIAL_ROBOT, type RobotState } from '../../robot/robotState';
import { calibrateButton } from './calibrateButton';

const inTest = (run: string): RobotState => ({
  ...INITIAL_ROBOT,
  link: 'connected',
  spec: { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true },
  mode: 'test',
  status: { mode: 'test', run, sealed: false, fault_latched: false, joints: [] },
});

const RUNS = ['soft_start', 'running', 'stopping', 'stopped'];
const PHASES = ['idle', 'capturing', 'moving', 'fitting'] as const;

describe('Calibrate Servos', () => {
  it('is enabled exactly while the motors run, and says it is calibrating whenever it is disabled', () => {
    for (const run of RUNS)
      for (const phase of PHASES) {
        const button = calibrateButton({ robot: inTest(run), phase, fromThisScene: () => true });
        const why = `${run} ${phase}`;

        if (button?.disabled) expect(button.label, why).toBe('Calibrating…');
        else if (button) expect([run, phase, button.label], why).toEqual(['running', 'idle', 'Calibrate Servos']);
        else expect(phase, why).toBe('idle');
      }
  });

  it('is offered only in Test, for bus servos, in the scene the robot was connected from', () => {
    const running = inTest('running');

    expect(calibrateButton({ robot: running, phase: 'idle', fromThisScene: () => true })).toEqual({
      label: 'Calibrate Servos',
      disabled: false,
    });
    expect(calibrateButton({ robot: running, phase: 'idle', fromThisScene: () => false })).toBeNull();
    expect(
      calibrateButton({ robot: { ...running, mode: 'set_up' }, phase: 'idle', fromThisScene: () => true }),
    ).toBeNull();
    expect(
      calibrateButton({
        robot: { ...running, spec: { family: 'unitree-g1', ids: [13], class: 'legged', emulated: true } },
        phase: 'idle',
        fromThisScene: () => true,
      }),
    ).toBeNull();
  });
});
