import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RobotEvent, RobotMode } from '../robot/robotState';
import { climbUnit } from './climbUnit';

const robot = vi.hoisted(() => ({
  mode: 'look' as RobotMode,
  listeners: new Set<(event: RobotEvent) => void>(),
  send: vi.fn(),
}));

vi.mock('../robot/robotStore', () => ({
  unitSnapshot: () => ({ state: { mode: robot.mode } }),
  subscribeFleetEvents: (listener: (event: RobotEvent) => void) => {
    robot.listeners.add(listener);

    return () => robot.listeners.delete(listener);
  },
  sendUnitCommand: (unit: string, command: { cmd: string; mode: RobotMode }) => robot.send(unit, command),
}));

function emit(event: RobotEvent) {
  for (const listener of robot.listeners) listener(event);
}

beforeEach(() => {
  robot.mode = 'look';
  robot.listeners.clear();
  robot.send.mockReset();
});

describe('climbing one fleet unit', () => {
  it('waits for its own rung events and unsubscribes at every completed rung', async () => {
    robot.send.mockImplementation(async (unit: string, command: { mode: RobotMode }) => {
      emit({ event: 'fault', unit: 'other', message: 'Other robot fault.' });
      robot.mode = command.mode;
      emit({ event: 'mode', unit, mode: command.mode });

      return { ok: true };
    });

    expect(await climbUnit('arm-1', 'rehearse')).toBeNull();
    expect(robot.send.mock.calls.map(([, command]) => command.mode)).toEqual(['set_up', 'test', 'rehearse']);
    expect(robot.listeners.size).toBe(0);
  });

  it('releases its listener when sending the rung is refused', async () => {
    robot.send.mockResolvedValue({ ok: false, message: 'Calibrate first.' });

    expect(await climbUnit('arm-1', 'rehearse')).toBe('Calibrate first.');
    expect(robot.listeners.size).toBe(0);
  });

  it('reports a rejected command and releases its listener', async () => {
    robot.send.mockRejectedValue(new Error('Robot transport closed.'));

    expect(await climbUnit('arm-1', 'rehearse')).toBe('Robot transport closed.');
    expect(robot.listeners.size).toBe(0);
  });

  it('reports a unit fault while entering a rung and releases its listener', async () => {
    robot.send.mockImplementation(async () => {
      emit({ event: 'fault', unit: 'arm-1', message: 'Load limit.' });

      return { ok: true };
    });

    expect(await climbUnit('arm-1', 'rehearse')).toBe('Load limit.');
    expect(robot.send).toHaveBeenCalledTimes(1);
    expect(robot.listeners.size).toBe(0);
  });
});
