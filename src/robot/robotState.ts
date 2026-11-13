import type { ControllerKind } from '../../electron/robot/ros2.mjs';

export const LADDER = ['look', 'set_up', 'test', 'rehearse', 'first_run', 'policy', 'longer_runs'] as const;

export type RobotMode = (typeof LADDER)[number];

export type ServoFamily = 'feetech' | 'dynamixel';

export type RobotFamily = ServoFamily | 'unitree-g1' | 'ros2';

export interface Ros2Controller {
  kind: ControllerKind;
  topic: string;
}

export interface RobotSpec {
  family: RobotFamily;
  ids: number[];
  class: 'arm' | 'legged';
  emulated: true;
  factory?: true;
  controller?: Ros2Controller;
  joints?: string[];
}

export type ServoRobotSpec = RobotSpec & { family: ServoFamily };

export interface UnitreeG1Ask {
  family: 'unitree-g1';
  emulated: true;
}

export interface Ros2Ask {
  family: 'ros2';
  emulated: true;
  controller: Ros2Controller;
  joints: string[];
}

export type ConnectSpec = ServoRobotSpec | UnitreeG1Ask | Ros2Ask;

export function servoFamily(spec: { family: RobotFamily } | null | undefined): ServoFamily | null {
  const family = spec?.family;

  return family === 'feetech' || family === 'dynamixel' ? family : null;
}

export const isServoAsk = (spec: ConnectSpec): spec is ServoRobotSpec => servoFamily(spec) !== null;

export const TEST_TOP_FAMILIES: readonly RobotFamily[] = ['unitree-g1', 'ros2'];

const TEST_LADDER = LADDER.slice(0, LADDER.indexOf('test') + 1);

export const ladderFor = (spec: { family: RobotFamily } | null | undefined): readonly RobotMode[] =>
  spec && TEST_TOP_FAMILIES.includes(spec.family) ? TEST_LADDER : LADDER;

export type ConnectReply = { ok: true } | { ok: false; message: string };

export interface JointStatus {
  id: number | null;
  position: number | null;
  temp_c: number | null;
  volts: number | null;
  torque_on: boolean | null;
  reply: string;
}

export interface RobotStatus {
  at_us?: number;
  mode: RobotMode;
  run: string;
  sealed: boolean;
  fault_latched: boolean;
  joints: JointStatus[];
}

export interface RobotMessage {
  id: number;
  kind: 'fault' | 'refused' | 'stopped' | 'lost';
  text: string;
}

export interface RobotState {
  link: 'off' | 'connected' | 'lost';
  spec: RobotSpec | null;
  emulated: boolean;
  lostMessage: string | null;
  mode: RobotMode;
  status: RobotStatus | null;
  pending: RobotMode | null;
  messages: RobotMessage[];
}

export type RobotEvent = Record<string, unknown> & { event: string };

export interface RobotLinkState {
  connected: boolean;
  spec: RobotSpec | null;
  hello: RobotEvent | null;
  status: RobotEvent | null;
}

export const MAX_MESSAGES = 6;

export const INITIAL_ROBOT: RobotState = {
  link: 'off',
  spec: null,
  emulated: true,
  lostMessage: null,
  mode: 'look',
  status: null,
  pending: null,
  messages: [],
};

const isMode = (value: unknown): value is RobotMode => LADDER.includes(value as RobotMode);

let nextMessage = 1;

function withMessage(state: RobotState, kind: RobotMessage['kind'], text: unknown): RobotState {
  if (typeof text !== 'string' || !text) return state;

  const message = { id: nextMessage++, kind, text };

  return { ...state, messages: [message, ...state.messages].slice(0, MAX_MESSAGES) };
}

function onLink(state: RobotState, event: RobotEvent): RobotState {
  if (event.state === 'connected')
    return { ...INITIAL_ROBOT, link: 'connected', spec: (event.spec as RobotSpec) ?? null };

  if (event.state === 'lost') return withMessage({ ...state, link: 'lost', pending: null }, 'lost', event.message);

  return { ...INITIAL_ROBOT, messages: state.messages };
}

function onMode(state: RobotState, mode: unknown): RobotState {
  return isMode(mode) ? { ...state, mode, pending: state.pending === mode ? null : state.pending } : state;
}

const EVENTS: Record<string, (state: RobotState, event: RobotEvent) => RobotState> = {
  link: onLink,
  hello: (state, event) => ({ ...state, emulated: event.emulated === true, lostMessage: String(event.lost_message) }),
  status: (state, event) => ({ ...onMode(state, event.mode), status: event as unknown as RobotStatus }),
  mode: (state, event) => onMode(state, event.mode),
  fault: (state, event) => withMessage({ ...state, pending: null }, 'fault', event.message),
  refused: (state, event) => withMessage({ ...state, pending: null }, 'refused', event.message),
  stopped: (state, event) => withMessage(state, 'stopped', event.message),
};

export function applyRobotEvent(state: RobotState, event: RobotEvent): RobotState {
  return EVENTS[event.event]?.(state, event) ?? state;
}

export const rungIndex = (mode: RobotMode) => LADDER.indexOf(mode);

export const motorsCanRun = (mode: RobotMode) => rungIndex(mode) >= rungIndex('test');

export function rungEnabled(state: RobotState, rung: RobotMode): boolean {
  if (state.link !== 'connected' || state.pending) return false;

  if (rung === 'look') return state.mode !== 'look';

  return rungIndex(rung) === rungIndex(state.mode) + 1;
}

export const radiansFromCounts = (counts: number) => ((counts - 2048) * 2 * Math.PI) / 4096;
