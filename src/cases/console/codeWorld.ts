import { isHexColor, type WorldChange } from '../../sim/worldLooks';
import type { V3 } from '../../utils/kinematics';
import type { WorldObject } from '../schema';

export const WORLD_CALLS_PER_SECOND = 60;

const MAX_MM = 100_000;
const MAX_DEG = 3600;

type Data = Record<string, unknown>;

const isData = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value);

const within = (limit: number) => (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

const vec = (value: unknown, limit: number): V3 | null | undefined => {
  if (value === undefined) return undefined;

  return Array.isArray(value) && value.length === 3 && value.every(within(limit))
    ? [value[0], value[1], value[2]]
    : null;
};

function readPose(value: unknown): Pick<WorldChange, 'position' | 'rotation'> | null {
  if (value === undefined) return {};

  if (!isData(value)) return null;

  const position = vec(value.position, MAX_MM);
  const rotation = vec(value.rotation, MAX_DEG);

  if (position === null || rotation === null) return null;

  return { ...(position ? { position } : {}), ...(rotation ? { rotation } : {}) };
}

export function readWorldChange(name: unknown, value: unknown): WorldChange | undefined {
  if (typeof name !== 'string' || !/^[\w.-]{1,80}$/.test(name) || !isData(value)) return undefined;

  const pose = readPose(value.pose);
  const color = value.colour ?? value.color;

  if (!pose || (value.visible !== undefined && typeof value.visible !== 'boolean')) return undefined;

  if (color !== undefined && !isHexColor(color)) return undefined;

  const change: WorldChange = {
    id: name,
    ...pose,
    ...(value.visible === undefined ? {} : { visible: value.visible }),
    ...(color === undefined ? {} : { color: color.toLowerCase() }),
  };

  return Object.keys(change).length > 1 ? change : undefined;
}

export function worldRefusal(change: WorldChange, objects: readonly WorldObject[]): string | null {
  const object = objects.find((o) => o.id === change.id);

  if (!object) return `names ${change.id}, which isn’t in the Case’s world`;

  return object.movable ? null : `${change.id} isn’t movable`;
}
