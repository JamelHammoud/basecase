import { DEFAULT_UNIT, nextUnitName } from '../../electron/robot/units.mjs';
import { loadSession } from '../cases/tryStore';
import type { ElectronApi } from '../utils/platform/types';
import type { RobotConnection } from './jointRows';
import { readOperateLog } from './operateLog';
import type { RobotPolicyRef } from './robotPolicy';
import type { NetworkRobotAsk } from './networkTypes';
import { NETWORK_ROBOT_MISMATCH, networkRobotMatches } from './networkRobot';
import { recalledSceneJoints, rememberSceneJoints } from './sceneJointsMemory';
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
  type RobotUnitState,
} from './robotState';
import {
  connectedUnits,
  fleetOf,
  rowKey,
  unitEntry,
  unitOfEvent,
  withEvent,
  type Fleet,
  type UnitEntry,
} from './robotUnits';

const units = new Map<string, UnitEntry>();
let selected: string = DEFAULT_UNIT;
let state: RobotState = INITIAL_ROBOT;
let sceneJoints: string[] | null = null;
let fleet: Fleet = fleetOf(units, selected);

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
  | 'robotUnits'
  | 'robotRollBack'
  | 'robotDiscover'
  | 'robotNetworkConnect'
>;

let api: RobotLinkApi | null = null;
let policies: RobotPolicyRef[] | undefined;
const benchUnits = new Set<string>();
const faultUnits = new Set<string>();
const pendingFaults = new Map<string, RunFault & { messageId: number }>();
const runs = new Map<number, RobotRun>();
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: RobotEvent) => void>();
const fleetListeners = new Set<(event: RobotEvent) => void>();

function notify() {
  fleet = fleetOf(units, selected);

  for (const listener of listeners) listener();
}

function set(next: RobotState) {
  if (next === state) return;

  state = next;
  units.set(selected, { ...(units.get(selected) ?? unitEntry(selected)), state: next });
  notify();
}

export const robotSnapshot = (unit?: string) => (unit ? (units.get(unit)?.state ?? INITIAL_ROBOT) : state);

export const fleetSnapshot = () => fleet;

export const selectedUnit = () => selected;

export const robotSceneJoints = (unit?: string) => (unit ? (units.get(unit)?.joints ?? null) : sceneJoints);

export const unitSnapshot = (unit: string) => units.get(unit) ?? null;

export function robotConnection(robot: RobotState): RobotConnection | null {
  if (robot.link !== 'connected') return null;

  return {
    ids: robot.spec?.ids ?? [],
    jointIds: sceneJoints,
    readings: robot.status?.joints ?? [],
    calibration: robot.calibration,
  };
}

export const robotBenchDriving = (unit: string = selected) => benchUnits.has(unit);

export function setBenchDriving(driving: boolean, unit: string = selected) {
  if (driving) benchUnits.add(unit);
  else benchUnits.delete(unit);
}

export const robotFaultHeld = () => faultUnits.has(selected);

export const robotRunFor = (messageId: number) => runs.get(messageId) ?? null;

function servoJoint(next: RobotState, id: unknown, joints: string[] | null): string | null {
  const k = typeof id === 'number' ? (next.spec?.ids.indexOf(id) ?? -1) : -1;

  return k >= 0 ? (joints?.[k] ?? null) : null;
}

function noteFault(unit: string, before: UnitEntry, next: RobotState, event: RobotEvent) {
  const message = next.messages[0];

  if (event.event !== 'fault' || !message || message === before.state.messages[0]) return;

  faultUnits.add(unit);
  pendingFaults.set(unit, {
    messageId: message.id,
    joints: [...(before.joints ?? [])],
    faultJoint: servoJoint(next, event.id, before.joints),
    faultAt: Date.now(),
    message: message.text,
  });

  const visibleIds = new Set([...units.values()].flatMap((u) => u.state.messages.map((m) => m.id)));

  for (const id of runs.keys()) if (!visibleIds.has(id)) runs.delete(id);
}

async function readFaultRun(unit: string, id: string, fault: RunFault & { messageId: number }) {
  const text = await loadSession(id).catch(() => null);

  if (!text || !units.get(unit)?.state.messages.some((m) => m.id === fault.messageId)) return;

  const { messageId, ...run } = fault;

  runs.set(messageId, runOf(readOperateLog(text), run));
  notify();
}

function noteRecorded(unit: string, event: RobotEvent) {
  const manifest = event.manifest as { id?: unknown } | null;
  const fault = pendingFaults.get(unit);

  if (event.event !== 'recorded' || event.reason !== 'fault') return;

  pendingFaults.delete(unit);

  if (fault && typeof manifest?.id === 'string') void readFaultRun(unit, manifest.id, fault);
}

function noteRun(unit: string, before: UnitEntry, after: UnitEntry, event: RobotEvent) {
  if (event.event === 'link' || event.event === 'mode') faultUnits.delete(unit);

  if (event.event === 'link') benchUnits.delete(unit);

  noteFault(unit, before, after.state, event);
  noteRecorded(unit, event);
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

export function subscribeFleetEvents(listener: (event: RobotEvent) => void) {
  fleetListeners.add(listener);

  return () => {
    fleetListeners.delete(listener);
  };
}

function show(unit: string) {
  const entry = units.get(unit) ?? unitEntry(unit);

  selected = unit;
  state = entry.state;
  sceneJoints = entry.joints;
}

export function selectUnit(unit: string): boolean {
  const entry = units.get(unit);

  if (!entry || entry.state.link === 'off') return false;

  if (unit !== selected) {
    show(unit);
    notify();
  }

  return true;
}

function selectAnotherIfClosed(entry: UnitEntry) {
  if (entry.state.link !== 'off') return;

  const next = connectedUnits(fleetOf(units, selected)).find((u) => u.unit !== selected);

  if (next) show(next.unit);
}

function receiveSelected(event: RobotEvent, entry: UnitEntry) {
  if (event.event === 'link' && event.state !== 'connected') rememberSceneJoints(selected, null);

  state = entry.state;
  sceneJoints = entry.joints;
  units.set(selected, entry);
  selectAnotherIfClosed(entry);
  notify();

  for (const listener of eventListeners) listener(event);
}

function receiveOther(unit: string, before: UnitEntry, after: UnitEntry) {
  if (after.state.link === 'off') units.delete(unit);
  else units.set(unit, after);

  if (rowKey(before) !== rowKey(after) || after.state.link === 'off') notify();
}

export function receiveRobotEvent(event: RobotEvent) {
  const unit = unitOfEvent(event);
  const before = units.get(unit) ?? unitEntry(unit);
  const after = withEvent(before, event);

  noteRun(unit, before, after, event);

  if (unit === selected) receiveSelected(event, after);
  else receiveOther(unit, before, after);

  for (const listener of fleetListeners) listener(event);
}

function adopted(link: RobotLinkState | RobotUnitState, unit: string): UnitEntry {
  const events = [
    { event: 'link', state: 'connected', spec: link.spec },
    link.hello,
    link.status,
    link.calibration ? { event: 'calibration', joints: link.calibration } : null,
  ];
  const robot = events.reduce<RobotState>((s, e) => (e ? applyRobotEvent(s, e) : s), INITIAL_ROBOT);
  const pins =
    'version' in link ? { version: link.version, previous: link.previous, hasPrevious: link.hasPrevious } : {};

  return { ...unitEntry(unit), ...pins, state: robot, joints: recalledSceneJoints(unit) };
}

async function adoptAll(link: RobotLinkApi) {
  const listed: Array<RobotLinkState | RobotUnitState> = (await link.robotUnits?.()) ?? [
    (await link.robotState?.()) ?? { connected: false, spec: null, hello: null, status: null },
  ];

  for (const one of listed) {
    const unit = 'unit' in one ? one.unit : DEFAULT_UNIT;

    if (one.connected && units.get(unit)?.state.link !== 'connected') units.set(unit, adopted(one, unit));
  }

  const chosen = units.get(selected) ?? connectedUnits(fleetOf(units, selected))[0];

  if (chosen) show(chosen.unit);

  notify();
}

export function startRobotStore(link: RobotLinkApi) {
  if (api || !link.onRobotEvent) return;

  api = link;
  link.onRobotEvent(receiveRobotEvent);

  if (policies) void link.robotPolicy?.(policies);

  void adoptAll(link);
}

const unavailable: ConnectReply = { ok: false, message: 'Emulated robots run in the desktop app.' };

const takenUnits = () => connectedUnits(fleet).map((u) => u.unit);

export const discoverRobots = async () => (await api?.robotDiscover?.()) ?? [];

function rememberConnectedJoints(name: string, joints: string[]) {
  rememberSceneJoints(name, joints);
  units.set(name, { ...(units.get(name) ?? unitEntry(name)), joints });

  if (name === selected) sceneJoints = joints;

  notify();
}

export async function connectNetworkRobot(
  ask: NetworkRobotAsk,
  joints: string[],
  spec: ConnectSpec,
): Promise<ConnectReply> {
  const name = nextUnitName(takenUnits());

  if (state.link !== 'connected') {
    show(name);
    notify();
  }

  const reply = (await api?.robotNetworkConnect?.(ask, name)) ?? unavailable;

  if (!reply.ok) return reply;

  const actual = api?.robotState ? (await api.robotState(name))?.spec : units.get(name)?.state.spec;

  if (!networkRobotMatches(actual, { spec, joints })) {
    await api?.robotDisconnect?.(name);

    return { ok: false, message: NETWORK_ROBOT_MISMATCH };
  }

  rememberConnectedJoints(name, joints);

  return reply;
}

export async function connectRobot(spec: ConnectSpec, joints: string[], unit?: string): Promise<ConnectReply> {
  const name = unit ?? nextUnitName(takenUnits());

  if (state.link !== 'connected') {
    show(name);
    notify();
  }

  const reply = (await api?.robotConnect?.(spec, name)) ?? unavailable;

  if (!reply.ok) return reply;

  rememberConnectedJoints(name, joints);

  return reply;
}

export function setRobotPolicy(refs: RobotPolicyRef[]) {
  policies = refs;
  void api?.robotPolicy?.(refs);
}

export const pinUnitPolicy = async (unit: string, ref: RobotPolicyRef) =>
  (await api?.robotPolicy?.([ref], unit)) ?? unavailable;

export const rollBackUnit = async (unit: string) => (await api?.robotRollBack?.(unit)) ?? unavailable;

export const disconnectRobot = async () => (await api?.robotDisconnect?.(selected)) ?? unavailable;

export const sendUnitCommand = async (unit: string, command: Record<string, unknown>): Promise<ConnectReply> =>
  (await api?.robotCommand?.(command, unit)) ?? unavailable;

export const sendRobotCommand = (command: Record<string, unknown>) => sendUnitCommand(selected, command);

function recordSelected(sample: RobotSample) {
  if (state.link === 'connected') void api?.robotRecord?.(sample, selected);
}

function sameJoints(a: string[] | null, b: string[]) {
  return !!a && a.length === b.length && a.every((j, k) => j === b[k]);
}

export function recordRobotSample(sample: RobotSample) {
  if (!('scene' in sample)) {
    recordSelected(sample);

    return;
  }

  for (const entry of connectedUnits(fleet))
    if (entry.unit === selected || sameJoints(entry.joints, sample.scene.joints))
      void api?.robotRecord?.(sample, entry.unit);
}

export const robotLinkState = async () => (await api?.robotState?.(selected)) ?? null;

export const setUnitMounts = async (unit: string, joints: RobotMount[]) =>
  (await api?.robotCalibrate?.(joints, unit)) ?? unavailable;

export const setRobotMounts = (joints: RobotMount[]) => setUnitMounts(selected, joints);

export async function enterRung(mode: RobotMode) {
  const unit = selected;

  set({ ...state, pending: mode });

  const reply = await sendRobotCommand({ cmd: 'enter', mode });

  if (!reply.ok) receiveRobotEvent({ event: 'refused', unit, message: reply.message });
}
