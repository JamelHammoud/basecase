import type { V3 } from '../utils/kinematics';

export const WORLD_CALLS_PER_SECOND = 60;
export const WORLD_REACH_MM = 50_000;

export interface WorldPose {
  position?: V3;
  rotation?: V3;
}

export interface WorldChange {
  id: string;
  pose?: WorldPose;
  visible?: boolean;
  color?: string;
}

export interface WorldEvent extends WorldChange {
  at: number;
}

export interface WorldLook {
  visible?: boolean;
  color?: string;
}

export type WorldLooks = Record<string, WorldLook>;

type Data = Record<string, unknown>;

const isData = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value);

const isV3 = (value: unknown, limit: number): value is V3 =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit);

const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

const isWorldId = (value: unknown): value is string => typeof value === 'string' && /^[\w.-]{1,80}$/.test(value);

function readPose(value: unknown): WorldPose | undefined {
  if (!isData(value) || (value.position === undefined && value.rotation === undefined)) return undefined;

  if (value.position !== undefined && !isV3(value.position, WORLD_REACH_MM)) return undefined;

  if (value.rotation !== undefined && !isV3(value.rotation, 3600)) return undefined;

  return {
    ...(value.position === undefined ? {} : { position: [...(value.position as V3)] as V3 }),
    ...(value.rotation === undefined ? {} : { rotation: [...(value.rotation as V3)] as V3 }),
  };
}

const looksValid = (value: Data) =>
  (value.visible === undefined || typeof value.visible === 'boolean') &&
  (value.colour === undefined || isColor(value.colour));

export function readWorldChange(value: unknown): WorldChange | undefined {
  if (!isData(value) || !isWorldId(value.name) || !looksValid(value)) return undefined;

  const pose = value.pose === undefined ? undefined : readPose(value.pose);

  if (value.pose !== undefined && !pose) return undefined;

  if (!pose && value.visible === undefined && value.colour === undefined) return undefined;

  return {
    id: value.name,
    ...(pose ? { pose } : {}),
    ...(value.visible === undefined ? {} : { visible: value.visible as boolean }),
    ...(value.colour === undefined ? {} : { color: (value.colour as string).toLowerCase() }),
  };
}

export interface MovableObject {
  id: string;
  movable?: boolean;
}

export function worldRefusal(objects: readonly MovableObject[], id: string): string | null {
  const object = objects.find((o) => o.id === id);

  if (!object) return `${id} isn’t in the Case’s world`;

  return object.movable ? null : `${id} isn’t movable`;
}
