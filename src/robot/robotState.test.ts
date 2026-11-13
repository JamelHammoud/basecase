import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { intentFromSim } from './intentMirror';
import {
  ladderFor,
  applyRobotEvent,
  INITIAL_ROBOT,
  MAX_MESSAGES,
  rungEnabled,
  type RobotEvent,
  type RobotState,
} from './robotState';
import { sceneRobot } from './sceneRobot';

const SPEC = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };

const replay = (events: RobotEvent[], from: RobotState = INITIAL_ROBOT) => events.reduce(applyRobotEvent, from);

const connected = () =>
  replay([
    { event: 'link', state: 'connected', spec: SPEC },
    { event: 'hello', emulated: true, real_transport: false, lost_message: 'Lost contact with the robot.' },
  ]);

const joint = (id: string, extra: Partial<RobotJoint> = {}): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [0, 0, 1],
  ...extra,
});

describe('robot state', () => {
  it('offers the G1 only Look, Set Up and Test', () => {
    expect(ladderFor({ family: 'unitree-g1' })).toEqual(['look', 'set_up', 'test']);
    expect(ladderFor({ family: 'feetech' })).toHaveLength(7);
    expect(ladderFor(null)).toHaveLength(7);
  });

  it('lets only the next rung or Look be entered, one at a time', () => {
    const look = connected();

    expect(rungEnabled(look, 'set_up')).toBe(true);
    expect(rungEnabled(look, 'test')).toBe(false);
    expect(rungEnabled(look, 'look')).toBe(false);
    expect(rungEnabled({ ...look, pending: 'set_up' }, 'set_up')).toBe(false);

    const setUp = applyRobotEvent({ ...look, pending: 'set_up' }, { event: 'mode', mode: 'set_up' });

    expect(setUp.pending).toBeNull();
    expect(rungEnabled(setUp, 'test')).toBe(true);
    expect(rungEnabled(setUp, 'look')).toBe(true);
    expect(rungEnabled(INITIAL_ROBOT, 'set_up')).toBe(false);
  });

  it('keeps every fault and refusal in the daemon’s words, newest first', () => {
    const state = replay(
      [
        { event: 'refused', message: 'Set up needs every servo to answer first.' },
        { event: 'fault', code: 'overheat', message: 'Servo 2 reached 51 °C.' },
      ],
      { ...connected(), pending: 'test' },
    );

    expect(state.messages.map((m) => m.text)).toEqual([
      'Servo 2 reached 51 °C.',
      'Set up needs every servo to answer first.',
    ]);
    expect(state.pending).toBeNull();

    const many = replay(
      Array.from({ length: 10 }, (_, i) => ({ event: 'fault', message: `Fault ${i}` })),
      state,
    );

    expect(many.messages).toHaveLength(MAX_MESSAGES);
  });

  it('shows the hello’s lost message when the daemon dies', () => {
    const lost = applyRobotEvent(connected(), {
      event: 'link',
      state: 'lost',
      message: 'Lost contact with the robot.',
    });

    expect(lost.link).toBe('lost');
    expect(lost.messages[0]).toMatchObject({ kind: 'lost', text: 'Lost contact with the robot.' });
  });

  it('turns the live sim into intents in connection order, holding unknown joints where they are', () => {
    const state = applyRobotEvent(connected(), {
      event: 'status',
      mode: 'test',
      joints: [{ id: 2, position: 3072, reply: 'ok' }],
    });

    expect(intentFromSim(state, ['a', 'b'], { ids: ['b', 'a'], targets: [0.5, -0.25] })).toEqual([-0.25, 0.5]);
    expect(intentFromSim(state, ['a', 'b'], { ids: ['a'], targets: [0.1] })).toEqual([0.1, Math.PI / 2]);
  });

  it('connects a scene robot as emulated Feetech servos over its movable joints', () => {
    const robot = sceneRobot([joint('a'), joint('fixed', { type: 'fixed' }), joint('b', { limb: 'leg' })]);

    expect(robot).toEqual({
      ok: true,
      spec: { family: 'feetech', ids: [1, 2], class: 'legged', emulated: true },
      joints: ['a', 'b'],
    });
    expect(sceneRobot([]).ok).toBe(false);
  });
});
