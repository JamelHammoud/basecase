import type { V3 } from '../utils/kinematics';
import type { WorldObject } from './schema';
import { asId, asNumber, asRecord, asString, listOf, optional, refuse, vector, type Reader } from './validate';

export interface ObjectColorClass {
  name: string;
  color: string;
}

export interface ObjectImageDeclarations {
  colors?: ObjectColorClass[];
  points?: Record<string, V3>;
}

export interface CaseImageDeclarations {
  cameraTolerance?: { mm: number; deg: number };
  distractors?: WorldObject[];
}

const readColor: Reader<ObjectColorClass> = (value, where) => {
  const v = asRecord(value, where);
  const name = asString(v.name, `${where}.name`).trim();
  const color = asString(v.color, `${where}.color`);

  if (!name) refuse(`${where}.name`, 'must name a class');

  if (!/^#[0-9a-f]{6}$/i.test(color)) refuse(`${where}.color`, 'must be a six-digit hex color');

  return { name, color: color.toLowerCase() };
};

const readColors: Reader<ObjectColorClass[]> = (value, where) => {
  const colors = listOf(readColor, 32)(value, where);

  if (!colors.length) refuse(where, 'must hold a color');

  if (new Set(colors.map((c) => c.name)).size !== colors.length) refuse(where, 'repeats a class name');

  return colors;
};

const readPoints: Reader<Record<string, V3>> = (value, where) => {
  const entries = Object.entries(asRecord(value, where));

  if (entries.length > 64) refuse(where, 'holds more than 64 points');

  return Object.fromEntries(
    entries.map(([name, point]) => [asId(name, where), vector(3)(point, `${where}.${name}`) as V3]),
  );
};

export function readObjectImages(v: Record<string, unknown>, where: string): ObjectImageDeclarations {
  return {
    ...(v.colors === undefined ? {} : { colors: readColors(v.colors, `${where}.colors`) }),
    ...(v.points === undefined ? {} : { points: readPoints(v.points, `${where}.points`) }),
  };
}

const bounded = (value: unknown, where: string, max: number) => {
  const n = asNumber(value, where);

  return n >= 0 && n <= max ? n : refuse(where, `must be from 0 to ${max}`);
};

const readTolerance: Reader<NonNullable<CaseImageDeclarations['cameraTolerance']>> = (value, where) => {
  const v = asRecord(value, where);

  return { mm: bounded(v.mm, `${where}.mm`, 500), deg: bounded(v.deg, `${where}.deg`, 45) };
};

export function readCaseImages(
  value: unknown,
  objects: WorldObject[],
  readObjects: (value: unknown, where: string) => WorldObject[],
): CaseImageDeclarations | undefined {
  if (value === undefined) return undefined;

  const v = asRecord(value, 'images');
  const distractors = v.distractors === undefined ? undefined : readObjects(v.distractors, 'images.distractors');
  const ids = [...objects, ...(distractors ?? [])].map((o) => o.id);

  if (new Set(ids).size !== ids.length) refuse('images.distractors', 'repeats a world object id');

  return {
    ...(v.cameraTolerance === undefined
      ? {}
      : { cameraTolerance: optional(readTolerance, v.cameraTolerance, 'images.cameraTolerance') }),
    ...(distractors === undefined ? {} : { distractors }),
  };
}
