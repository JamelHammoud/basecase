import { describe, expect, it } from 'vitest';
import type { NetworkRobotAsk } from './networkTypes';
import { networkRobotAsk } from './networkRobot';
import {
  connectNetworkRobot,
  discoverRobots,
  receiveRobotEvent,
  robotSceneJoints,
  robotSnapshot,
  startRobotStore,
} from './robotStore';

const asks: NetworkRobotAsk[] = [];
const SPEC = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const ROBOT_ID = 'a'.repeat(64);

startRobotStore({
  onRobotEvent: () => () => {},
  robotUnits: async () => [],
  robotDiscover: async () => [{ id: ROBOT_ID, name: 'Kitchen Arm', host: 'robot.local', port: 7447 }],
  robotNetworkConnect: async (ask, unit) => {
    asks.push(ask);
    receiveRobotEvent({ event: 'link', state: 'connected', unit, spec: SPEC });
    receiveRobotEvent({ event: 'hello', unit, name: 'Kitchen Arm', emulated: true });

    return { ok: true };
  },
});

describe('network robot connection state', () => {
  it('lists robot names and maps daemon telemetry onto the scene joints', async () => {
    const robots = await discoverRobots();

    expect(robots).toEqual([{ id: ROBOT_ID, name: 'Kitchen Arm', host: 'robot.local', port: 7447 }]);
    expect(await connectNetworkRobot(networkRobotAsk(robots[0], '482619'), ['shoulder', 'elbow'])).toEqual({
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

    expect(await connectNetworkRobot(networkRobotAsk(moved), ['shoulder', 'elbow'])).toEqual({ ok: true });
    expect(asks[1]).toEqual({ id: ROBOT_ID, host: movedHost, port: 7447 });
  });

  it('keeps manual endpoints without an advertised identity compatible', () => {
    expect(networkRobotAsk({ name: 'Kitchen Arm', host: 'robot.local', port: 7447 })).toEqual({
      host: 'robot.local',
      port: 7447,
    });
  });
});
