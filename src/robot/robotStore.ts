import type { TakeSample } from '../../electron/robot/takeTap.mjs';
import { relistTries } from '../cases/tryStore';
import type { ElectronApi } from '../utils/platform/types';
import type { RobotConnection } from './jointRows';
import type { RobotPolicyRef } from './robotPolicy';
import type { FaultRun } from './runBuffer';
import {
  applyRobotEvent,
  INITIAL_ROBOT,
  type ConnectReply,
  type ConnectSpec,
  type RobotEvent,
  type RobotLinkState,
  type RobotMode,
  type RobotMount,
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
  | 'robotTakeScene'
  | 'robotTakeSample'
>;

export interface TakeScene {
  sceneId: string;
  robot: string;
}

let api: RobotLinkApi | null = null;
let policies: RobotPolicyRef[] | undefined;
let benchDriving = false;
let faultHeld = false;
let takeScene: TakeScene | null = null;
const runs = new Map<number, FaultRun>();
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

function keepFaultRun(next: RobotState, event: RobotEvent) {
  const message = next.messages[0];

  if (event.event !== 'fault' || !message || message === state.messages[0]) return;

  faultHeld = true;
  runs.set(message.id, {
    takeId: null,
    replayable: false,
    joints: [...(sceneJoints ?? [])],
    faultJoint: servoJoint(next, event.id),
    faultAt: Date.now(),
    message: message.text,
  });

  for (const id of runs.keys()) if (!next.messages.some((m) => m.id === id)) runs.delete(id);
}

function noteTake(event: RobotEvent): boolean {
  if (event.event !== 'take' || event.state !== 'kept' || typeof event.id !== 'string') return false;

  void relistTries();

  const waiting = event.fault ? [...runs.values()].reverse().find((r) => r.takeId === null) : undefined;

  if (!waiting) return false;

  Object.assign(waiting, { takeId: event.id, replayable: event.replayable === true });

  return true;
}

function noteRun(next: RobotState, event: RobotEvent) {
  if (event.event === 'link' || event.event === 'mode') faultHeld = false;

  keepFaultRun(next, event);

  return noteTake(event);
}

function sendTakeScene() {
  if (!takeScene || !sceneJoints || state.link !== 'connected') return;

  void api?.robotTakeScene?.({ ...takeScene, joints: sceneJoints });
}

export function setTakeScene(scene: TakeScene | null) {
  if (scene?.sceneId === takeScene?.sceneId && scene?.robot === takeScene?.robot) return;

  takeScene = scene;
  sendTakeScene();
}

export function sendTakeSample(sample: TakeSample) {
  if (state.link === 'connected') void api?.robotTakeSample?.(sample);
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

  set(noteRun(next, event) ? { ...next } : next);

  if (event.event === 'link' && event.state === 'connected') sendTakeScene();

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
  sendTakeScene();
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

  if (reply.ok) {
    setSceneJoints(joints);
    sendTakeScene();
  }

  return reply;
}

export function setRobotPolicy(refs: RobotPolicyRef[]) {
  policies = refs;
  void api?.robotPolicy?.(refs);
}

export const disconnectRobot = async () => (await api?.robotDisconnect?.()) ?? unavailable;

export const sendRobotCommand = async (command: Record<string, unknown>): Promise<ConnectReply> =>
  (await api?.robotCommand?.(command)) ?? unavailable;

export const robotLinkState = async () => (await api?.robotState?.()) ?? null;

export const setRobotMounts = async (joints: RobotMount[]) => (await api?.robotCalibrate?.(joints)) ?? unavailable;

export async function enterRung(mode: RobotMode) {
  set({ ...state, pending: mode });

  const reply = await sendRobotCommand({ cmd: 'enter', mode });

  if (!reply.ok) receiveRobotEvent({ event: 'refused', message: reply.message });
}
