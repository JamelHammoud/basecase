import type { ElectronApi } from '../utils/platform/types';
import type { RobotConnection } from './jointRows';
import type { RobotPolicyRef } from './robotPolicy';
import { RunBuffer, statusPositions, type RobotRun } from './runBuffer';
import {
  applyRobotEvent,
  INITIAL_ROBOT,
  type ConnectReply,
  type ConnectSpec,
  type RobotEvent,
  type RobotLinkState,
  type RobotMode,
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
  'robotConnect' | 'robotCommand' | 'robotDisconnect' | 'robotState' | 'onRobotEvent' | 'robotPolicy'
>;

let api: RobotLinkApi | null = null;
let policies: RobotPolicyRef[] | undefined;
let benchDriving = false;
let faultHeld = false;
const run = new RunBuffer();
const runs = new Map<number, RobotRun>();
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: RobotEvent) => void>();

function set(next: RobotState) {
  if (next === state) return;

  state = next;

  for (const listener of listeners) listener();
}

export const robotSnapshot = () => state;

export const robotSceneJoints = () => sceneJoints;

export function robotConnection(robot: RobotState): RobotConnection | null {
  if (robot.link !== 'connected') return null;

  return { ids: robot.spec?.ids ?? [], jointIds: sceneJoints, readings: robot.status?.joints ?? [] };
}

export const robotBenchDriving = () => benchDriving;

export function setBenchDriving(driving: boolean) {
  benchDriving = driving;
}

export const robotFaultHeld = () => faultHeld;

export const robotRunFor = (messageId: number) => runs.get(messageId) ?? null;

function servoJoint(next: RobotState, id: unknown): string | null {
  const k = typeof id === 'number' ? (next.spec?.ids.indexOf(id) ?? -1) : -1;

  return k >= 0 ? (sceneJoints?.[k] ?? null) : null;
}

function keepFaultRun(next: RobotState, event: RobotEvent) {
  const message = next.messages[0];

  if (event.event !== 'fault' || !message || message === state.messages[0]) return;

  faultHeld = true;
  runs.set(message.id, {
    ...run.kept(),
    joints: [...(sceneJoints ?? [])],
    faultJoint: servoJoint(next, event.id),
    faultAt: Date.now(),
    message: message.text,
  });

  for (const id of runs.keys()) if (!next.messages.some((m) => m.id === id)) runs.delete(id);
}

function noteRun(next: RobotState, event: RobotEvent) {
  if (event.event === 'link' || event.event === 'mode') faultHeld = false;

  if (event.event === 'link' && event.state === 'connected') run.clear();

  if (event.event === 'status' && next.status && next.spec)
    run.status(performance.now(), statusPositions(next.status, next.spec.ids));

  keepFaultRun(next, event);
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

  const next = applyRobotEvent(state, event);

  noteRun(next, event);
  set(next);

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

  if (policies) void link.robotPolicy?.(policies);

  void link.robotState?.().then(adopt);
}

const unavailable: ConnectReply = { ok: false, message: 'Emulated robots run in the desktop app.' };

export async function connectRobot(spec: ConnectSpec, joints: string[]): Promise<ConnectReply> {
  const reply = (await api?.robotConnect?.(spec)) ?? unavailable;

  if (reply.ok) setSceneJoints(joints);

  return reply;
}

export function setRobotPolicy(refs: RobotPolicyRef[]) {
  policies = refs;
  void api?.robotPolicy?.(refs);
}

export const disconnectRobot = async () => (await api?.robotDisconnect?.()) ?? unavailable;

export async function sendRobotCommand(command: Record<string, unknown>): Promise<ConnectReply> {
  const sentAt = performance.now();
  const reply = (await api?.robotCommand?.(command)) ?? unavailable;

  if (reply.ok && command.cmd === 'intent' && Array.isArray(command.joints) && state.status?.run === 'running')
    run.intent(
      sentAt,
      command.joints.map((v) => (typeof v === 'number' ? v : NaN)),
    );

  return reply;
}

export async function enterRung(mode: RobotMode) {
  set({ ...state, pending: mode });

  const reply = await sendRobotCommand({ cmd: 'enter', mode });

  if (!reply.ok) receiveRobotEvent({ event: 'refused', message: reply.message });
}
