import type { V3 } from '../utils/kinematics';
import type { ObjectJitter, WorldObject } from './schema';
import { asNumber, asRecord, asString, listOf, refuse, vector, type Reader } from './validate';

export const MAX_IMAGE_POINTS = 64;
export const MAX_IMAGE_COLORS = 64;
export const MAX_IMAGE_DISTRACTORS = 64;

export interface WorldColor {
  name: string;
  color: string;
}

export interface ImageRandomization {
  cameraTolerance?: ObjectJitter;
  distractors?: WorldObject[];
}

const readName: Reader<string> = (value, where) => {
  const name = asString(value, where);

  return name.trim().length && name.length <= 80 ? name : refuse(where, 'must name up to 80 characters');
};

export const readImagePoints: Reader<Record<string, V3>> = (value, where) => {
  const entries = Object.entries(asRecord(value, where));

  if (entries.length > MAX_IMAGE_POINTS) return refuse(where, `holds more than ${MAX_IMAGE_POINTS} points`);

  return Object.fromEntries(
    entries.map(([name, point]) => [readName(name, where), vector(3)(point, `${where}.${name}`) as V3]),
  );
};

const readColor: Reader<WorldColor> = (value, where) => {
  const v = asRecord(value, where);
  const color = asString(v.color, `${where}.color`);

  if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color))
    return refuse(`${where}.color`, 'must be a hex color');

  return { name: readName(v.name, `${where}.name`), color };
};

export const readImageColors: Reader<WorldColor[]> = (value, where) => {
  const colors = listOf(readColor, MAX_IMAGE_COLORS)(value, where);

  if (new Set(colors.map((color) => color.name)).size !== colors.length) return refuse(where, 'repeats a class name');

  return colors;
};

const tolerance = (value: unknown, where: string, max: number): number => {
  const n = asNumber(value, where);

  return n >= 0 && n <= max ? n : refuse(where, `must be from 0 to ${max}`);
};

const readCameraTolerance: Reader<ObjectJitter> = (value, where) => {
  const v = asRecord(value, where);

  return { mm: tolerance(v.mm, `${where}.mm`, 500), deg: tolerance(v.deg, `${where}.deg`, 45) };
};

function distractorReader(readObject: Reader<WorldObject>): Reader<WorldObject> {
  return (value, where) => {
    const v = asRecord(value, where);

    if (v.distractors !== undefined || v.imageRandomization !== undefined)
      return refuse(where, 'can’t hold distractors');

    return readObject(value, where);
  };
}

export function readImageRandomization(
  value: unknown,
  objects: WorldObject[],
  readObject: Reader<WorldObject>,
): ImageRandomization {
  const where = 'imageRandomization';
  const v = asRecord(value, where);
  const distractors =
    v.distractors === undefined
      ? undefined
      : listOf(distractorReader(readObject), MAX_IMAGE_DISTRACTORS)(v.distractors, `${where}.distractors`);
  const ids = [...objects, ...(distractors ?? [])].map((object) => object.id);

  if (new Set(ids).size !== ids.length) return refuse(`${where}.distractors`, 'repeats a world object id');

  return {
    ...(v.cameraTolerance === undefined
      ? {}
      : { cameraTolerance: readCameraTolerance(v.cameraTolerance, `${where}.cameraTolerance`) }),
    ...(distractors === undefined ? {} : { distractors }),
  };
}
