import { loadSession } from '../cases/tryStore';
import type { ElectronApi } from '../utils/platform/types';
import type { RobotConnection } from './jointRows';
import { readOperateLog } from './operateLog';
import type { RobotPolicyRef } from './robotPolicy';
import { runOf, type RobotRun, type RunFault } from './runBuffer';
import {
  applyRobotEvent,
  INITIAL_ROBOT,
  type ConnectReply,
  type ConnectSpec,
  type RobotEvent,
  type RobotLinkState,
  type RobotMode,
  type RobotMount,
  type RobotSample,
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
  | 'robotConnect'
  | 'robotCommand'
  | 'robotDisconnect'
  | 'robotState'
  | 'onRobotEvent'
  | 'robotPolicy'
  | 'robotCalibrate'
  | 'robotRecord'
>;

let api: RobotLinkApi | null = null;
let policies: RobotPolicyRef[] | undefined;
let benchDriving = false;
let faultHeld = false;
let pendingFault: (RunFault & { messageId: number }) | null = null;
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

  return {
    ids: robot.spec?.ids ?? [],
    jointIds: sceneJoints,
    readings: robot.status?.joints ?? [],
    calibration: robot.calibration,
  };
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

function noteFault(next: RobotState, event: RobotEvent) {
  const message = next.messages[0];

  if (event.event !== 'fault' || !message || message === state.messages[0]) return;

  faultHeld = true;
  pendingFault = {
    messageId: message.id,
    joints: [...(sceneJoints ?? [])],
    faultJoint: servoJoint(next, event.id),
    faultAt: Date.now(),
    message: message.text,
  };

  for (const id of runs.keys()) if (!next.messages.some((m) => m.id === id)) runs.delete(id);
}

async function readFaultRun(id: string, fault: RunFault & { messageId: number }) {
  const text = await loadSession(id).catch(() => null);

  if (!text || !state.messages.some((m) => m.id === fault.messageId)) return;

  const { messageId, ...run } = fault;

  runs.set(messageId, runOf(readOperateLog(text), run));
  set({ ...state });
}

function noteRecorded(event: RobotEvent) {
  const manifest = event.manifest as { id?: unknown } | null;
  const fault = pendingFault;

  if (event.event !== 'recorded' || event.reason !== 'fault') return;

  pendingFault = null;

  if (fault && typeof manifest?.id === 'string') void readFaultRun(manifest.id, fault);
}

function noteRun(next: RobotState, event: RobotEvent) {
  if (event.event === 'link' || event.event === 'mode') faultHeld = false;

  noteFault(next, event);
  noteRecorded(event);
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

  const events = [
    { event: 'link', state: 'connected', spec: link.spec },
    link.hello,
    link.status,
    link.calibration ? { event: 'calibration', joints: link.calibration } : null,
  ];

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

export const sendRobotCommand = async (command: Record<string, unknown>): Promise<ConnectReply> =>
  (await api?.robotCommand?.(command)) ?? unavailable;

export function recordRobotSample(sample: RobotSample) {
  if (state.link === 'connected') void api?.robotRecord?.(sample);
}

export const robotLinkState = async () => (await api?.robotState?.()) ?? null;

export const setRobotMounts = async (joints: RobotMount[]) => (await api?.robotCalibrate?.(joints)) ?? unavailable;

export async function enterRung(mode: RobotMode) {
  set({ ...state, pending: mode });

  const reply = await sendRobotCommand({ cmd: 'enter', mode });

  if (!reply.ok) receiveRobotEvent({ event: 'refused', message: reply.message });
}
