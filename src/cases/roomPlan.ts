import { fileSize, MB } from '../../electron/fileSize.mjs';
import type { V3 } from '../utils/kinematics';
import { CONFIDENCES, type Confidence } from './roomFurniture';
import {
  inRoomFrame,
  roomDoors,
  roomFrame,
  roomObjects,
  type RoomFrame,
  type RoomItem,
  type RoomScan,
  type RoomSurface,
} from './roomWalls';
import { readWorldObjects, type WorldObject } from './schema';
import { asNumber, asRecord, asString, CaseFileError, listOf, optional, refuse, type Reader } from './validate';

export interface RoomStart {
  at: V3;
  heading: number;
}

export interface Room {
  name: string;
  objects: WorldObject[];
  doors: WorldObject[];
  start?: RoomStart;
}

export const ROOM_FILE_EXTENSION = 'json';
export const MAX_ROOM_BYTES = 8 * MB;

const MAX_ENTRIES = 1024;
const MAX_SIZE_M = 50;
const MAX_OFFSET_M = 500;
const MAX_AXIS = 1.01;
const MM_PER_M = 1000;
const CATEGORY = /^[A-Za-z]{1,40}$/;

export const isRoomFileName = (name: string) => name.toLowerCase().endsWith(`.${ROOM_FILE_EXTENSION}`);

const bounded =
  (limit: number): Reader<number> =>
  (value, where) => {
    const n = asNumber(value, where);

    return Math.abs(n) <= limit ? n : refuse(where, `must be within ${limit}`);
  };

const readSize: Reader<V3> = (value, where) => {
  const size = listOf(bounded(MAX_SIZE_M), 3)(value, where);

  if (size.length !== 3) return refuse(where, 'must hold 3 numbers');

  return size.some((x) => x < 0) ? refuse(where, 'must not be negative') : (size.map((x) => x * MM_PER_M) as V3);
};

function matrixOf(value: unknown, where: string): number[] {
  const columns = Array.isArray(value) && Array.isArray(value[0]);
  const flat = columns ? listOf(listOf(bounded(MAX_OFFSET_M), 4), 4)(value, where).flat() : value;
  const m = listOf(bounded(MAX_OFFSET_M), 16)(flat, where);

  return m.length === 16 ? m : refuse(where, 'must hold 16 numbers');
}

function readPlacement(value: unknown, where: string): { center: V3; yaw: number } {
  const m = matrixOf(value, where);
  const axis = [m[0], m[1], m[2]];

  if (axis.some((x) => Math.abs(x) > MAX_AXIS) || Math.hypot(m[0], m[2]) < 1e-3)
    return refuse(where, 'must be a rotation and a move');

  return {
    center: [m[12] * MM_PER_M, m[13] * MM_PER_M, m[14] * MM_PER_M],
    yaw: Math.atan2(-m[2], m[0]),
  };
}

const readCategory: Reader<string> = (value, where) => {
  const key = typeof value === 'string' ? value : Object.keys(asRecord(value, where))[0];

  return typeof key === 'string' && CATEGORY.test(key) ? key : refuse(where, 'must name a category');
};

const readSurface: Reader<RoomSurface> = (value, where) => {
  const v = asRecord(value, where);

  return {
    id: optional(asString, v.identifier ?? undefined, `${where}.identifier`),
    parent: optional(asString, v.parentIdentifier ?? undefined, `${where}.parentIdentifier`),
    size: readSize(v.dimensions, `${where}.dimensions`),
    ...readPlacement(v.transform, `${where}.transform`),
  };
};

const readConfidence = (value: unknown): Confidence | undefined => {
  const key = typeof value === 'string' ? value : Object.keys(Object(value ?? {}))[0];

  return CONFIDENCES.find((c) => c === key);
};

const readItem: Reader<RoomItem> = (value, where) => {
  const v = asRecord(value, where);
  const confidence = readConfidence(v.confidence);

  return {
    ...readSurface(value, where),
    category: readCategory(v.category, `${where}.category`),
    ...(confidence ? { confidence } : {}),
  };
};

const listIn = <T>(v: Record<string, unknown>, key: string, read: Reader<T>): T[] =>
  v[key] === undefined ? [] : listOf(read, MAX_ENTRIES)(v[key], key);

export function readRoomScan(input: unknown): RoomScan {
  const v = asRecord(input, 'A room file');
  const scan: RoomScan = {
    walls: listIn(v, 'walls', readSurface),
    doors: listIn(v, 'doors', readSurface),
    windows: listIn(v, 'windows', readSurface),
    openings: listIn(v, 'openings', readSurface),
    objects: listIn(v, 'objects', readItem),
  };

  return scan.walls.length + scan.objects.length ? scan : refuse('A room file', 'holds no walls or objects');
}

function parseJson(text: string): unknown {
  if (text.length > MAX_ROOM_BYTES) return refuse('A room file', `is over ${fileSize(MAX_ROOM_BYTES)}`);

  try {
    return JSON.parse(text);
  } catch {
    return refuse('A room file', 'must be JSON');
  }
}

export const roomName = (fileName: string) =>
  fileName
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 60) || 'Room';

function readTap(value: unknown): RoomSurface {
  const v = asRecord(value, 'basecase');
  const start = listOf(bounded(MAX_OFFSET_M), 3)(v.start, 'basecase.start');

  if (start.length !== 3) return refuse('basecase.start', 'must hold 3 numbers');

  return {
    size: [0, 0, 0],
    center: start.map((x) => x * MM_PER_M) as V3,
    yaw: v.heading === undefined ? 0 : asNumber(v.heading, 'basecase.heading'),
  };
}

function readStart(value: unknown, frame: RoomFrame): RoomStart | undefined {
  if (value === undefined) return undefined;

  try {
    const { center, yaw } = inRoomFrame(readTap(value), frame);

    return { at: [center[0], 0, center[2]], heading: yaw };
  } catch (error) {
    if (error instanceof CaseFileError) return undefined;

    throw error;
  }
}

export function readRoomPlan(text: string, fileName: string): Room {
  const file = parseJson(text);
  const scan = readRoomScan(file);
  const objects = roomObjects(scan);

  if (!objects.length) throw new CaseFileError('A room file holds no walls or objects');

  const start = readStart(asRecord(file, 'A room file').basecase, roomFrame(scan));

  return {
    name: roomName(fileName),
    objects: readWorldObjects(objects),
    doors: readWorldObjects(roomDoors(scan)),
    ...(start ? { start } : {}),
  };
}
