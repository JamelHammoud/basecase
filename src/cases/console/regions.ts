import {
  MAX_LINES,
  MAX_ZONES,
  MAX_ZONE_POINTS,
  type CameraRegions,
  type Line,
  type Point,
  type Zone,
} from '../../vision/tracking/types';
import { asNumber, asRecord, asString, listOf, optional, refuse, type Reader } from '../validate';

export type ConsoleRegions = Record<string, CameraRegions>;

export const MAX_REGION_CAMERAS = 8;

const CAMERA_KEY = /^[\w-]{1,64}$/u;
const REGION_NAME = /^[a-z][\w-]{0,39}$/iu;
const MIN_LINE = 0.01;

const readName: Reader<string> = (value, where) => {
  const name = asString(value, where);

  return REGION_NAME.test(name) ? name : refuse(where, 'must be a plain name without dots');
};

const readPoint: Reader<Point> = (value, where) => {
  if (!Array.isArray(value) || value.length !== 2) return refuse(where, 'must be an x and y');

  const [x, y] = value.map((n, i) => asNumber(n, `${where}[${i}]`));

  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [x, y] : refuse(where, 'must be from 0 to 1');
};

const readLabel = (v: Record<string, unknown>, where: string) => {
  const label = optional(asString, v.label, `${where}.label`);

  return label === undefined ? {} : { label };
};

const readZone: Reader<Zone> = (value, where) => {
  const v = asRecord(value, where);
  const points = listOf(readPoint, MAX_ZONE_POINTS)(v.points, `${where}.points`);

  if (points.length < 3) refuse(`${where}.points`, 'must hold three points');

  return { name: readName(v.name, `${where}.name`), points, ...readLabel(v, where) };
};

const readLine: Reader<Line> = (value, where) => {
  const v = asRecord(value, where);
  const from = readPoint(v.from, `${where}.from`);
  const to = readPoint(v.to, `${where}.to`);

  if (Math.hypot(from[0] - to[0], from[1] - to[1]) < MIN_LINE) refuse(where, 'needs two distinct points');

  return { name: readName(v.name, `${where}.name`), from, to, ...readLabel(v, where) };
};

function distinct<T extends { name: string }>(items: T[], where: string) {
  const seen = new Set<string>();

  items.forEach((item, i) => {
    const key = item.name.toLowerCase();

    if (seen.has(key)) refuse(`${where}[${i}]`, `repeats ${item.name}`);

    seen.add(key);
  });

  return items;
}

const readCamera: Reader<CameraRegions> = (value, where) => {
  const v = asRecord(value, where);

  return {
    zones: distinct(optional(listOf(readZone, MAX_ZONES), v.zones, `${where}.zones`) ?? [], `${where}.zones`),
    lines: distinct(optional(listOf(readLine, MAX_LINES), v.lines, `${where}.lines`) ?? [], `${where}.lines`),
  };
};

export const readRegions: Reader<ConsoleRegions> = (value, where) => {
  const v = asRecord(value, where);
  const keys = Object.keys(v);

  if (keys.length > MAX_REGION_CAMERAS) refuse(where, `holds more than ${MAX_REGION_CAMERAS} cameras`);

  return Object.fromEntries(
    keys.map((key) => [
      CAMERA_KEY.test(key) ? key : refuse(`${where}.${key}`, 'must be a camera name'),
      readCamera(v[key], `${where}.${key}`),
    ]),
  );
};

export const hasRegions = (regions: CameraRegions | undefined) =>
  !!regions && (!!regions.zones.length || !!regions.lines.length);
