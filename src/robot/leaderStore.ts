import { leaderAngles, leaderCommand, leaderPlan, type LeaderPlan, type LeaderPlanInput } from '../leader/leaderDrive';
import type { DriveCommand } from '../sim/driveTypes';
import type { JointValues } from '../types/robotics';
import type { ElectronApi } from '../utils/platform/types';
import { measuredAngles } from './robotGap';
import { applyRobotEvent, INITIAL_ROBOT, type ConnectReply, type RobotEvent, type RobotState } from './robotState';
import { unavailable, type RobotLinkApi } from './robotStore';
import { sceneRobot } from './sceneRobot';

export type LeaderLinkApi = Pick<RobotLinkApi, 'robotConnect' | 'robotDisconnect' | 'onRobotEvent'>;

interface Zero {
  rest: JointValues;
  leader: Record<string, number>;
}

let api: LeaderLinkApi | null = null;
let state: RobotState = INITIAL_ROBOT;
let plan: LeaderPlan | null = null;
let zero: Zero | null = null;
const listeners = new Set<() => void>();

function receive(event: RobotEvent) {
  state = applyRobotEvent(state, event);

  if (state.link !== 'connected') {
    plan = null;
    zero = null;
  }

  for (const listener of listeners) listener();
}

export function startLeaderStore(link: LeaderLinkApi | null) {
  if (api || !link?.onRobotEvent) return;

  api = link;
  link.onRobotEvent(receive);
}

export function electronLeaderLink(electron: ElectronApi): LeaderLinkApi | null {
  const { leaderConnect, leaderDisconnect, onLeaderEvent } = electron;

  if (!leaderConnect || !leaderDisconnect || !onLeaderEvent) return null;

  return { robotConnect: leaderConnect, robotDisconnect: leaderDisconnect, onRobotEvent: onLeaderEvent };
}

export const leaderSnapshot = () => state;

export const leaderConnected = () => state.link === 'connected' && !!plan;

export const canConnectLeader = () => !!api;

export function subscribeLeader(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function connectLeader(input: LeaderPlanInput): Promise<ConnectReply> {
  const robot = sceneRobot(input.leader);

  if (!robot.ok) return { ok: false, message: robot.reason };

  const reply = (await api?.robotConnect?.(robot.spec)) ?? unavailable;

  if (reply.ok) {
    plan = leaderPlan(input);
    zero = null;
  }

  return reply;
}

export const disconnectLeader = async () => (await api?.robotDisconnect?.()) ?? unavailable;

export function leaderDrive(rest: JointValues): DriveCommand | null {
  if (!plan || state.link !== 'connected') return null;

  const now = leaderAngles(plan, measuredAngles(state));

  if (!Object.keys(now).length) return null;

  if (zero?.rest !== rest) zero = { rest, leader: now };

  return leaderCommand(plan, { leader: zero.leader, follower: rest }, now);
}
