import { describe, expect, it, vi } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import type { RobotEvent, RobotSpec } from './robotState';
import { receiveRobotEvent, robotSnapshot, startRobotStore, type RobotLinkApi } from './robotStore';
import { canSetUpServos, endServoSetup, servoSetup, setUpServos } from './servoSetup';

const joint = (id: string): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [`${id}-parent`],
  child: [`${id}-link`],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
});

const JOINTS = [joint('shoulder'), joint('elbow'), joint('wrist')];

function factoryBus() {
  let emit: (event: RobotEvent) => void = () => {};
  let ids: number[] = [];
  let mode = 'look';
  const bus: number[] = [];
  const sent: Record<string, unknown>[] = [];
  const tick = () =>
    emit({
      event: 'status',
      mode,
      run: 'idle',
      joints: ids.map((id) => ({ id, reply: bus.includes(id) ? 'ok' : 'missing' })),
    });
  const commands: Record<string, (command: Record<string, unknown>) => void> = {
    enter: (command) => {
      mode = String(command.mode);
      emit({ event: 'mode', mode });
    },
    assign_id: (command) => {
      const fresh = bus.findIndex((id) => id === 1);

      if (fresh < 0) return emit({ event: 'refused', message: 'No new servo answers.' });

      bus[fresh] = Number(command.id);
      emit({ event: 'assigned', id: command.id });
    },
  };
  const link: RobotLinkApi = {
    onRobotEvent: (listener) => {
      emit = listener;

      return () => {};
    },
    robotState: async () => ({ connected: false, spec: null, hello: null, status: null }),
    robotConnect: async (spec: RobotSpec) => {
      ids = spec.ids;
      emit({ event: 'link', state: 'connected', spec });

      return { ok: true };
    },
    robotCommand: async (command) => {
      sent.push(command);
      commands[String(command.cmd)]?.(command);

      return { ok: true };
    },
    robotDisconnect: async () => ({ ok: true }),
  };

  return { link, bus, sent, tick };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('servo setup', () => {
  const fake = factoryBus();
  let selected: string[] = [];
  const select = (ids: string[]) => {
    selected = ids;
  };
  const stepId = () => servoSetup()?.step?.id;

  startRobotStore(fake.link);

  it('connects a factory bus, enters Set Up and lights the highest joint first', async () => {
    expect(canSetUpServos(JOINTS, robotSnapshot())).toBe(true);
    await setUpServos({ joints: JOINTS, select });
    await settle();
    expect(robotSnapshot().spec?.factory).toBe(true);
    expect(robotSnapshot().mode).toBe('set_up');
    expect(stepId()).toBeUndefined();

    fake.tick();
    expect(stepId()).toBe(3);
    expect(selected).toEqual(['wrist-link']);
    expect(fake.sent.at(-1)).toEqual({ cmd: 'plug_in' });
  });

  it('numbers the new servo, then waits for its ID before the next joint', async () => {
    fake.bus.push(1);
    fake.tick();
    await settle();
    expect(fake.sent.at(-1)).toEqual({ cmd: 'assign_id', id: 3, model: 777 });
    expect(stepId()).toBe(2);
    expect(selected).toEqual(['elbow-link']);

    const sentBefore = fake.sent.length;

    fake.tick();
    await settle();
    expect(fake.sent.at(-1)).toEqual({ cmd: 'plug_in' });
    expect(fake.sent).toHaveLength(sentBefore + 1);
  });

  it('ends on Esc with the written IDs kept, and resumes where the bus left off', async () => {
    endServoSetup();
    expect(servoSetup()).toBeNull();
    expect(selected).toEqual([]);
    expect(fake.bus).toEqual([3]);

    await setUpServos({ joints: JOINTS, select });
    fake.tick();
    expect(stepId()).toBe(2);
  });

  it('ends on a refusal, and finishes with ID 1 once every other servo answers', async () => {
    receiveRobotEvent({ event: 'refused', message: 'More than one new servo answers.' });
    expect(servoSetup()).toBeNull();

    await setUpServos({ joints: JOINTS, select });
    fake.bus.push(1);
    fake.tick();
    await settle();
    expect(stepId()).toBe(1);

    fake.tick();
    fake.bus.push(1);
    fake.tick();
    await vi.waitFor(() => expect(servoSetup()).toBeNull());
    expect(fake.bus.sort()).toEqual([1, 2, 3]);
    expect(selected).toEqual([]);
    expect(canSetUpServos(JOINTS, robotSnapshot())).toBe(false);
  });
});
