import { afterEach, describe, expect, it } from 'vitest';
import type { NetworkRobotAsk } from './networkTypes';
import { NETWORK_ROBOT_MISMATCH, networkRobotAsk, networkRobotChoice, networkRobotMatches } from './networkRobot';
import type { RobotSpec, ServoRobotSpec } from './robotState';
import type { ConnectChoice } from './sceneRobot';
import { G1_WRITABLE_IDS } from './unitreeG1';
import {
  connectNetworkRobot,
  discoverRobots,
  receiveRobotEvent,
  robotSceneJoints,
  robotSnapshot,
  startRobotStore,
} from './robotStore';

const asks: NetworkRobotAsk[] = [];
const disconnected: string[] = [];
const inspected: Array<string | undefined> = [];
const SPEC: ServoRobotSpec = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const ROBOT_ID = 'a'.repeat(64);
let greeting: RobotSpec = SPEC;
let publishGreeting = true;

afterEach(() => {
  greeting = SPEC;
  publishGreeting = true;
});

startRobotStore({
  onRobotEvent: () => () => {},
  robotUnits: async () => [],
  robotDiscover: async () => [{ id: ROBOT_ID, name: 'Kitchen Arm', host: 'robot.local', port: 7447 }],
  robotState: async (unit) => {
    inspected.push(unit);

    return { connected: true, spec: greeting, hello: null, status: null };
  },
  robotNetworkConnect: async (ask, unit) => {
    asks.push(ask);

    if (publishGreeting) {
      receiveRobotEvent({ event: 'link', state: 'connected', unit, spec: greeting });
      receiveRobotEvent({ event: 'hello', unit, name: 'Kitchen Arm', emulated: true });
    }

    return { ok: true };
  },
  robotDisconnect: async (unit) => {
    disconnected.push(unit!);
    receiveRobotEvent({ event: 'link', state: 'closed', unit });

    return { ok: true };
  },
});

describe('network robot connection state', () => {
  it('lists robot names and maps daemon telemetry onto the scene joints', async () => {
    const robots = await discoverRobots();

    expect(robots).toEqual([{ id: ROBOT_ID, name: 'Kitchen Arm', host: 'robot.local', port: 7447 }]);
    expect(await connectNetworkRobot(networkRobotAsk(robots[0], '482619'), ['shoulder', 'elbow'], SPEC)).toEqual({
      ok: true,
    });
    expect(asks).toEqual([{ id: ROBOT_ID, host: 'robot.local', port: 7447, code: '482619' }]);
    expect(robotSceneJoints()).toEqual(['shoulder', 'elbow']);
    expect(robotSnapshot().link).toBe('connected');
    expect(robotSnapshot().name).toBe('Kitchen Arm');
    expect(robotSnapshot()).not.toHaveProperty('code');
    receiveRobotEvent({ event: 'link', state: 'lost', message: 'Connection closed.' });
    expect(robotSnapshot().link).toBe('lost');

    const movedHost = [192, 168, 1, 42].join('.');
    const moved = { ...robots[0], host: movedHost };

    expect(await connectNetworkRobot(networkRobotAsk(moved), ['shoulder', 'elbow'], SPEC)).toEqual({ ok: true });
    expect(asks[1]).toEqual({ id: ROBOT_ID, host: movedHost, port: 7447 });
  });

  it('keeps manual endpoints without an advertised identity compatible', () => {
    expect(networkRobotAsk({ name: 'Kitchen Arm', host: 'robot.local', port: 7447 })).toEqual({
      host: 'robot.local',
      port: 7447,
    });
  });

  it('disconnects an incompatible joint count without keeping a scene mapping', async () => {
    expect(await connectNetworkRobot({ host: 'robot.local' }, ['shoulder', 'elbow', 'wrist'], SPEC)).toEqual({
      ok: false,
      message: NETWORK_ROBOT_MISMATCH,
    });
    expect(disconnected).toHaveLength(1);
    expect(robotSceneJoints(disconnected[0])).toBeNull();
    expect(robotSnapshot(disconnected[0]).link).toBe('off');
  });

  it('maps compatible servo families and keeps the G1 writable subset separate', () => {
    const servo: ConnectChoice = {
      spec: { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true },
      joints: ['shoulder', 'elbow'],
    };
    const g1: ConnectChoice = { spec: { family: 'unitree-g1', emulated: true }, joints: ['g1-shoulder'] };
    const robot = { name: 'Kitchen Arm', host: 'robot.local', port: 7447 };

    expect(networkRobotChoice({ ...robot, family: 'dynamixel' }, [servo])).toBe(servo);
    expect(networkRobotChoice({ ...robot, family: 'unitree-g1' }, [g1])).toBe(g1);
    expect(networkRobotChoice({ ...robot, family: 'unitree-g1' }, [servo])).toBeUndefined();
    expect(networkRobotChoice({ ...robot, family: 'feetech' }, [g1])).toBeUndefined();
    expect(networkRobotChoice(robot, [servo])).toBe(servo);
  });

  it.each<{ name: string; spec: RobotSpec }>([
    { name: 'reversed servo IDs', spec: { ...SPEC, ids: [2, 1] } },
    { name: 'different servo IDs', spec: { ...SPEC, ids: [3, 4] } },
    { name: 'a different robot class', spec: { ...SPEC, class: 'legged' } },
    { name: 'a different protocol family', spec: { ...SPEC, family: 'ros2' } },
  ])('rejects an authenticated greeting with $name despite matching counts', async ({ spec }) => {
    greeting = spec;

    const before = disconnected.length;

    expect(await connectNetworkRobot({ host: 'robot.local' }, ['shoulder', 'elbow'], SPEC)).toEqual({
      ok: false,
      message: NETWORK_ROBOT_MISMATCH,
    });
    expect(disconnected).toHaveLength(before + 1);
    expect(robotSceneJoints(disconnected.at(-1))).toBeNull();
    expect(robotSnapshot(disconnected.at(-1)).link).toBe('off');
  });

  it('checks ROS 2 joint order and controller kind against the authenticated greeting', () => {
    const choice: ConnectChoice = {
      spec: {
        family: 'ros2',
        emulated: true,
        joints: ['shoulder', 'elbow'],
        controller: { kind: 'forward_position', topic: '/arm/commands' },
      },
      joints: ['scene-shoulder', 'scene-elbow'],
    };
    const actual: RobotSpec = { ...SPEC, ...choice.spec };

    expect(networkRobotMatches(actual, choice)).toBe(true);
    expect(networkRobotMatches({ ...actual, joints: ['elbow', 'shoulder'] }, choice)).toBe(false);
    expect(
      networkRobotMatches({ ...actual, controller: { kind: 'joint_trajectory', topic: '/arm/commands' } }, choice),
    ).toBe(false);
    expect(networkRobotMatches({ ...SPEC, family: 'dynamixel' }, { spec: SPEC, joints: choice.joints })).toBe(true);
  });

  it('requires the G1 authenticated IDs to preserve its writable joint order', () => {
    const choice: ConnectChoice = {
      spec: { family: 'unitree-g1', emulated: true },
      joints: G1_WRITABLE_IDS.map((id) => `scene-joint-${id}`),
    };
    const actual: RobotSpec = {
      ...choice.spec,
      ids: [...G1_WRITABLE_IDS],
      class: 'legged',
    };

    expect(networkRobotMatches(actual, choice)).toBe(true);
    expect(networkRobotMatches({ ...actual, ids: [...actual.ids].reverse() }, choice)).toBe(false);
    expect(networkRobotMatches({ ...actual, family: 'feetech' }, choice)).toBe(false);
  });

  it('checks the main process state when the link event has not reached the page', async () => {
    publishGreeting = false;

    expect(await connectNetworkRobot({ host: 'robot.local' }, ['shoulder', 'elbow'], SPEC)).toEqual({ ok: true });

    const unit = inspected.at(-1);

    expect(unit).toBeDefined();
    expect(robotSceneJoints(unit)).toEqual(['shoulder', 'elbow']);
    receiveRobotEvent({ event: 'link', state: 'connected', unit, spec: SPEC });
    expect(robotSceneJoints(unit)).toEqual(['shoulder', 'elbow']);
  });
});
