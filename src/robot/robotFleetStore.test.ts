import { beforeAll, describe, expect, it } from 'vitest';
import type { ServoRobotSpec } from './robotState';
import {
  connectRobot,
  fleetSnapshot,
  receiveRobotEvent,
  robotFaultHeld,
  robotBenchDriving,
  robotSnapshot,
  setBenchDriving,
  selectUnit,
  sendRobotCommand,
  startRobotStore,
  subscribeRobot,
  type RobotLinkApi,
} from './robotStore';

const JOINTS = ['shoulder', 'elbow', 'wrist'];
const SPEC: ServoRobotSpec = { family: 'feetech', ids: [1, 2, 3], class: 'arm', emulated: true };
const FRAME_MS = 16;
const sent: Array<{ unit: string | undefined; command: Record<string, unknown> }> = [];

const link: RobotLinkApi = {
  onRobotEvent: () => () => {},
  robotConnect: async (spec, unit) => {
    receiveRobotEvent({ event: 'link', state: 'connected', spec, unit });

    return { ok: true };
  },
  robotCommand: async (command, unit) => {
    sent.push({ unit, command });

    return { ok: true };
  },
  robotUnits: async () => [],
};

const status = (unit: string, at: number, mode = 'test') => ({
  event: 'status',
  unit,
  at_us: at,
  mode,
  run: 'running',
  sealed: false,
  fault_latched: false,
  joints: SPEC.ids.map((id) => ({
    id,
    position: 2048 + at / 1000,
    temp_c: 30,
    volts: 7.4,
    torque_on: true,
    reply: 'ok',
  })),
});

const units = (n: number) => Array.from({ length: n }, (_, k) => `arm-${k + 1}`);

const rowsOf = () => fleetSnapshot().units.map((u) => [u.unit, u.state.mode, u.state.status?.fault_latched ?? false]);

beforeAll(async () => {
  startRobotStore(link);

  for (const unit of units(12)) {
    await connectRobot(SPEC, JOINTS, unit);
    receiveRobotEvent({ event: 'mode', mode: 'test', unit });
  }
});

describe('a fleet in the page store', () => {
  it('lists every connected unit by name and shows the first as the selected robot', () => {
    expect(fleetSnapshot().units.map((u) => u.unit)).toEqual(units(12).sort((a, b) => a.localeCompare(b)));
    expect(fleetSnapshot().selected).toBe('arm-1');
    expect(robotSnapshot().mode).toBe('test');
  });

  it('applies a status round from twelve units within one frame, and redraws rows only when a row changes', () => {
    let redraws = 0;
    const stop = subscribeRobot(() => redraws++);
    const started = performance.now();

    for (const unit of units(12)) receiveRobotEvent(status(unit, 1e5));

    redraws = 0;

    for (let round = 2; round <= 11; round++)
      for (const unit of units(12)) receiveRobotEvent(status(unit, round * 1e5));

    stop();

    expect((performance.now() - started) / 11).toBeLessThan(FRAME_MS);
    expect(redraws).toBe(10);
  });

  it('sends intents only to the selected unit', async () => {
    sent.length = 0;
    await sendRobotCommand({ cmd: 'intent', joints: [0.1, 0.2, 0.3] });
    expect(selectUnit('arm-7')).toBe(true);
    await sendRobotCommand({ cmd: 'intent', joints: [0.4, 0.5, 0.6] });

    expect(sent.map((s) => s.unit)).toEqual(['arm-1', 'arm-7']);
    expect(selectUnit('arm-99')).toBe(false);
    expect(fleetSnapshot().selected).toBe('arm-7');
    selectUnit('arm-1');
  });

  it('keeps a fault on one unit to that unit', () => {
    receiveRobotEvent({ ...status('arm-2', 2e6), fault_latched: true });
    receiveRobotEvent({ event: 'fault', unit: 'arm-2', code: 'stall', id: 2, message: 'The Elbow joint is stuck.' });

    expect(robotFaultHeld()).toBe(false);
    expect(robotSnapshot().messages).toEqual([]);
    expect(rowsOf().filter(([, , fault]) => fault)).toEqual([['arm-2', 'test', true]]);
    expect(rowsOf().filter(([, mode]) => mode === 'test')).toHaveLength(12);
    selectUnit('arm-2');
    expect(robotFaultHeld()).toBe(true);
    selectUnit('arm-1');
    expect(robotFaultHeld()).toBe(false);
  });

  it('keeps a calibration bench attached to its unit while selection changes', () => {
    setBenchDriving(true);
    expect(robotBenchDriving()).toBe(true);
    selectUnit('arm-3');
    expect(robotBenchDriving()).toBe(false);
    selectUnit('arm-1');
    expect(robotBenchDriving()).toBe(true);
    setBenchDriving(false);
  });

  it('shows the next connected unit when the selected one disconnects', () => {
    receiveRobotEvent({ event: 'link', state: 'closed', unit: 'arm-1' });

    expect(fleetSnapshot().selected).toBe('arm-10');
    expect(fleetSnapshot().units).toHaveLength(11);
  });
});
