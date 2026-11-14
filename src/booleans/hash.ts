import { hashText } from '../guide/guideItems';
import type { ScenePart } from '../types/robotics';
import { numbersHash } from '../utils/geometryHash';
import { baseOf, isBooleanPart, type BooleanPart } from './parts';

const NOT_GEOMETRY = new Set<string>([
  'id',
  'name',
  'note',
  'group',
  'locked',
  'visible',
  'role',
  'color',
  'opacity',
  'mechanicalTag',
  'print',
  'printMaterial',
  'sheet',
  'massG',
  'com',
  'supplyId',
  'jointId',
  'physics',
  'boolean',
  'mesh',
  'position',
]);

const LONG_ARRAY = 32;

const round = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

const relative = (position: readonly number[], origin: readonly number[]) =>
  position.map((v, i) => round(v - origin[i])).join(',');

const compactArrays = (_key: string, value: unknown) =>
  Array.isArray(value) && value.length > LONG_ARRAY && typeof value[0] === 'number' ? numbersHash(value) : value;

function shapeKey(part: ScenePart): string {
  const shape = Object.fromEntries(Object.entries(part).filter(([key]) => !NOT_GEOMETRY.has(key)));
  const mesh = part.mesh ? { ...part.mesh, visual: undefined } : undefined;

  return JSON.stringify({ shape, mesh }, compactArrays);
}

function operandKey(part: ScenePart, origin: readonly number[]): string {
  if (isBooleanPart(part)) {
    return `b:${booleanHash(part)}@${relative(baseOf(part).position, origin)}`;
  }

  return `${shapeKey(part)}@${relative(part.position, origin)}`;
}

const hashes = new WeakMap<ScenePart, string>();

export function booleanHash(part: BooleanPart): string {
  const known = hashes.get(part);

  if (known !== undefined) return known;

  const origin = baseOf(part).position;
  const text = [
    part.boolean.op,
    part.rotation.map(round).join(','),
    ...part.boolean.operands.map((o) => operandKey(o, origin)),
  ].join('|');
  const hash = `${hashText(text)}${text.length.toString(36)}`;

  hashes.set(part, hash);

  return hash;
}

export const isStale = (part: BooleanPart) => part.boolean.hash !== booleanHash(part);
