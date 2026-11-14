import type { DriveCommand } from '../../sim/driveTypes';
import type { FactValue } from '../caseFacts';
import { readWorldChange, type WorldChange } from '../worldSet';

export const BRIDGE_VERSION = 2;
export const SIGNAL_INTERVAL_MS = 50;
export const PING_MS = 500;
export const SILENT_MS = 2000;
export const HELLO_MS = 10_000;
export const MESSAGES_PER_SECOND = 240;
export const ERROR_MAX_CHARS = 500;
export const LOG_MAX_CHARS = 300;

export const MAX_NAMES = 32;

const MAX_CAMERA_CHARS = 40;
const MAX_ID = 1_000_000;

export type FrameKey = { key: 'Escape' | 'k'; meta: boolean; ctrl: boolean; shift: boolean };

export type FrameMessage =
  | { type: 'pong' }
  | { type: 'loaded' }
  | { type: 'subscribe'; id: number; names: string[] }
  | { type: 'unsubscribe'; id: number }
  | { type: 'drive'; command: DriveCommand | null }
  | { type: 'event'; name: string; value: FactValue }
  | { type: 'action'; id: number; name: string }
  | { type: 'error'; message: string; line?: number }
  | { type: 'log'; text: string }
  | ({ type: 'key' } & FrameKey)
  | { type: 'world'; change: WorldChange }
  | { type: 'frames'; id: number; camera: string; width?: number; fps?: number }
  | { type: 'unframes'; id: number };

export type SignalValues = Record<string, number | string[]>;

export type StudioMessage =
  | { type: 'ping' }
  | { type: 'signals'; id: number; time: number; values: SignalValues }
  | { type: 'action'; id: number; ok: boolean; problem?: string }
  | { type: 'frame'; id: number; bitmap: ImageBitmap };

type Data = Record<string, unknown>;

const isData = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value);

export const isHello = (value: unknown) => isData(value) && value.bc === BRIDGE_VERSION && value.type === 'hello';

const isId = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0 && Number(value) < MAX_ID;

const isLine = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0 && Number(value) < MAX_ID;

const isUnit = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1;

const isFinite3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

const isName = (value: unknown): value is string => typeof value === 'string' && /^[a-z][\w-]{0,39}$/i.test(value);

function readCommand(value: unknown): DriveCommand | null | undefined {
  if (value === null) return null;

  if (!isData(value) || !isFinite3(value.v) || !value.v.every(isUnit)) return undefined;

  const aux = value.aux;
  const target = value.target;

  if (aux !== undefined && !(Array.isArray(aux) && aux.length <= 2 && aux.every(isUnit))) return undefined;

  if (target !== undefined && !isFinite3(target)) return undefined;

  return {
    v: [...value.v],
    ...(aux === undefined ? {} : { aux: [...(aux as number[])] }),
    ...(target === undefined ? {} : { target: [...target] }),
  };
}

function readValue(value: unknown): FactValue | undefined {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  return typeof value === 'string' && value.length <= 200 ? value : undefined;
}

const isCamera = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_CAMERA_CHARS;

const isOptional = (value: unknown, check: (v: unknown) => boolean) => value === undefined || check(value);

const isRate = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

function readFrames(m: Data): FrameMessage | undefined {
  if (!isId(m.id) || !isCamera(m.camera) || !isOptional(m.width, Number.isInteger) || !isOptional(m.fps, isRate))
    return undefined;

  return {
    type: 'frames',
    id: m.id,
    camera: m.camera,
    ...(m.width === undefined ? {} : { width: m.width as number }),
    ...(m.fps === undefined ? {} : { fps: m.fps as number }),
  };
}

const readNames = (value: unknown) =>
  Array.isArray(value) && value.length > 0 && value.length <= MAX_NAMES && value.every((n) => typeof n === 'string')
    ? value.map((n: string) => n.slice(0, 120))
    : undefined;

const READERS: Record<string, (m: Data) => FrameMessage | undefined> = {
  pong: () => ({ type: 'pong' }),
  loaded: () => ({ type: 'loaded' }),
  subscribe: (m) => {
    const names = readNames(m.names);

    return isId(m.id) && names ? { type: 'subscribe', id: m.id, names } : undefined;
  },
  unsubscribe: (m) => (isId(m.id) ? { type: 'unsubscribe', id: m.id } : undefined),
  drive: (m) => {
    const command = readCommand(m.command);

    return command === undefined ? undefined : { type: 'drive', command };
  },
  event: (m) => {
    const value = readValue(m.value);

    return isName(m.name) && value !== undefined ? { type: 'event', name: m.name, value } : undefined;
  },
  action: (m) => (isId(m.id) && typeof m.name === 'string' ? { type: 'action', id: m.id, name: m.name } : undefined),
  error: (m) => ({
    type: 'error',
    message: String(m.message).slice(0, ERROR_MAX_CHARS),
    ...(isLine(m.line) ? { line: m.line } : {}),
  }),
  log: (m) => ({ type: 'log', text: String(m.text).slice(0, LOG_MAX_CHARS) }),
  key: (m) =>
    m.key === 'Escape' || m.key === 'k'
      ? { type: 'key', key: m.key, meta: m.meta === true, ctrl: m.ctrl === true, shift: m.shift === true }
      : undefined,
  world: (m) => {
    const change = readWorldChange(m);

    return change ? { type: 'world', change } : undefined;
  },
  frames: readFrames,
  unframes: (m) => (isId(m.id) ? { type: 'unframes', id: m.id } : undefined),
};

export function readFrameMessage(value: unknown): FrameMessage | string {
  if (!isData(value) || typeof value.type !== 'string') return 'sent a message that isn’t an object with a type';

  const read = Object.hasOwn(READERS, value.type) ? READERS[value.type] : undefined;

  if (!read) return `sent an unknown message, ${value.type.slice(0, 40)}`;

  return read(value) ?? `sent a malformed ${value.type} message`;
}
