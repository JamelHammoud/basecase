import type { ElectronApi } from '../utils/platform/types';
import {
  applyRobotEvent,
  INITIAL_ROBOT,
  type ConnectReply,
  type RobotEvent,
  type RobotLinkState,
  type RobotMode,
  type RobotSpec,
  type RobotState,
} from './robotState';

const SCENE_JOINTS_KEY = 'robot-scene-joints';

function rememberSceneJoints(joints: string[] | null) {
  try {
    if (joints) sessionStorage.setItem(SCENE_JOINTS_KEY, JSON.stringify(joints));
    else sessionStorage.removeItem(SCENE_JOINTS_KEY);
  } catch {
    return;
  }
}

function recalledSceneJoints(): string[] | null {
  try {
    const joints: unknown = JSON.parse(sessionStorage.getItem(SCENE_JOINTS_KEY) ?? 'null');

    return Array.isArray(joints) && joints.every((j) => typeof j === 'string') ? joints : null;
  } catch {
    return null;
  }
}

let state: RobotState = INITIAL_ROBOT;
let sceneJoints: string[] | null = null;

function setSceneJoints(joints: string[] | null) {
  sceneJoints = joints;
  rememberSceneJoints(joints);
}

export type RobotLinkApi = Pick<
  ElectronApi,
  'robotConnect' | 'robotCommand' | 'robotDisconnect' | 'robotState' | 'onRobotEvent'
>;

let api: RobotLinkApi | null = null;
let benchDriving = false;
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: RobotEvent) => void>();

function set(next: RobotState) {
  if (next === state) return;

  state = next;

  for (const listener of listeners) listener();
}

export const robotSnapshot = () => state;

export const robotSceneJoints = () => sceneJoints;

export const robotBenchDriving = () => benchDriving;

export function setBenchDriving(driving: boolean) {
  benchDriving = driving;
}

export function subscribeRobot(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function subscribeRobotEvents(listener: (event: RobotEvent) => void) {
  eventListeners.add(listener);

  return () => {
    eventListeners.delete(listener);
  };
}

export function receiveRobotEvent(event: RobotEvent) {
  if (event.event === 'link' && event.state !== 'connected') setSceneJoints(null);

  set(applyRobotEvent(state, event));

  for (const listener of eventListeners) listener(event);
}

function adopt(link: RobotLinkState) {
  if (!link.connected || state.link === 'connected') return;

  const events = [{ event: 'link', state: 'connected', spec: link.spec }, link.hello, link.status];

  sceneJoints = recalledSceneJoints();
  set(events.reduce<RobotState>((s, e) => (e ? applyRobotEvent(s, e) : s), INITIAL_ROBOT));
}

export function startRobotStore(link: RobotLinkApi) {
  if (api || !link.onRobotEvent) return;

  api = link;
  link.onRobotEvent(receiveRobotEvent);
  void link.robotState?.().then(adopt);
}

const unavailable: ConnectReply = { ok: false, message: 'Emulated robots run in the desktop app.' };

export async function connectRobot(spec: RobotSpec, joints: string[]): Promise<ConnectReply> {
  const reply = (await api?.robotConnect?.(spec)) ?? unavailable;

  if (reply.ok) setSceneJoints(joints);

  return reply;
}

export const disconnectRobot = async () => (await api?.robotDisconnect?.()) ?? unavailable;

export async function sendRobotCommand(command: Record<string, unknown>): Promise<ConnectReply> {
  return (await api?.robotCommand?.(command)) ?? unavailable;
}

export async function enterRung(mode: RobotMode) {
  set({ ...state, pending: mode });

  const reply = await sendRobotCommand({ cmd: 'enter', mode });

  if (!reply.ok) receiveRobotEvent({ event: 'refused', message: reply.message });
}
