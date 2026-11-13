import * as THREE from 'three';
import { pathKey } from './occurrences.mjs';

export const JOINT_TYPES = { REVOLUTE: 'revolute', SLIDER: 'prismatic' };

const MAX_NAME = 120;
const ANGLE_UNITS = { deg: Math.PI / 180, degree: Math.PI / 180, rad: 1, radian: 1 };
const LENGTH_UNITS = {
  mm: 0.001,
  millimeter: 0.001,
  cm: 0.01,
  centimeter: 0.01,
  m: 1,
  meter: 1,
  in: 0.0254,
  inch: 0.0254,
};
const LIMIT_PARAMETERS = {
  REVOLUTE: ['limitAxialZMin', 'limitAxialZMax', ANGLE_UNITS],
  SLIDER: ['limitZMin', 'limitZMax', LENGTH_UNITS],
};

const isTriple = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

const isFrame = (cs) => isTriple(cs?.origin) && isTriple(cs.xAxis) && isTriple(cs.yAxis) && isTriple(cs.zAxis);

function endOf(entity, prefix) {
  const path = entity?.matedOccurrence;

  if (!Array.isArray(path) || !isFrame(entity.matedCS)) return null;

  return { path: pathKey([...prefix, ...path.map(String)]), cs: entity.matedCS };
}

function mateOf({ feature, prefix }) {
  const data = feature?.featureData ?? {};

  if (feature?.featureType !== 'mate' || feature.suppressed) return null;

  const ends = (data.matedEntities ?? []).map((e) => endOf(e, prefix));

  if (ends.length !== 2 || ends.some((e) => !e)) return null;

  return {
    id: String(feature.id ?? ''),
    name: String(data.name ?? 'Mate').slice(0, MAX_NAME),
    type: String(data.mateType ?? ''),
    ends,
  };
}

function groupOf({ feature, prefix }) {
  if (feature?.featureType !== 'mateGroup' || feature.suppressed) return [];

  return (feature.featureData?.occurrences ?? [])
    .map((o) => o?.occurrence)
    .filter(Array.isArray)
    .map((path) => pathKey([...prefix, ...path.map(String)]));
}

export const matesOf = (features) => features.map(mateOf).filter(Boolean);

export const mateGroupsOf = (features) => features.map(groupOf).filter((g) => g.length > 1);

function quantity(parameter, units) {
  if (!parameter || parameter.isNull) return null;

  const m = /^\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\*?\s*([a-z]+)?\s*$/i.exec(String(parameter.expression ?? ''));

  const scale = m && (m[2] ? units[m[2].toLowerCase()] : Object.values(units)[0]);

  if (scale !== undefined && scale !== null) return Number(m[1]) * scale;

  return Number.isFinite(parameter.value) ? parameter.value : null;
}

function rangeOf(params, [lo, hi, units]) {
  const range = [quantity(params.get(lo), units), quantity(params.get(hi), units)];

  return range.every(Number.isFinite) && range[0] <= range[1] ? range : null;
}

export function mateLimits(features) {
  const limits = new Map();

  for (const feature of features?.features ?? []) {
    const params = new Map((feature?.parameters ?? []).map((p) => [p?.parameterId, p]));

    if (params.get('limitsEnabled')?.value !== true) continue;

    const ranges = Object.entries(LIMIT_PARAMETERS).map(([type, spec]) => [type, rangeOf(params, spec)]);

    limits.set(String(feature.featureId), Object.fromEntries(ranges));
  }

  return limits;
}

export function frameOf(world, cs) {
  const local = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...cs.xAxis),
    new THREE.Vector3(...cs.yAxis),
    new THREE.Vector3(...cs.zAxis),
  );

  local.setPosition(...cs.origin);

  return world.clone().multiply(local);
}

const column = (m, k) => new THREE.Vector3().setFromMatrixColumn(m, k).normalize();
const position = (m) => new THREE.Vector3().setFromMatrixPosition(m);

function mateValue(type, a, b) {
  const z = column(a, 2);

  if (type === 'SLIDER') return position(b).sub(position(a)).dot(z);

  const xa = column(a, 0);
  const xb = column(b, 0);

  return Math.atan2(new THREE.Vector3().crossVectors(xa, xb).dot(z), xa.dot(xb));
}

function nearest(value, target) {
  const turns = Math.round((target - value) / (2 * Math.PI));

  return value + turns * 2 * Math.PI;
}

export function jointFrame({ type, frames, childIsSecond, limit }) {
  const [a, b] = frames;
  const raw = mateValue(type, a, b);
  const now = type === 'REVOLUTE' && limit ? nearest(raw, (limit[0] + limit[1]) / 2) : raw;
  const world = new THREE.Matrix4().extractRotation(a).setPosition(position(a));

  return {
    world: world.toArray(),
    axis: [0, 0, childIsSecond ? 1 : -1],
    limit: limit ? [limit[0] - now, limit[1] - now] : null,
  };
}
