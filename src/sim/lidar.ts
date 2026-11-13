import * as THREE from 'three';
import { eulerToMatrix } from '../agent/agentFrame';
import { COMPONENT_BY_ID, specLines, type ComponentInfo } from '../data/components';
import { LIDAR_SCAN } from '../data/lidarScan';
import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';
import type { Eye } from './eyes';
import { toMj } from './mjcfFrames';
import type { SimBody } from './mjcfTypes';

export const MAX_SCAN_RAYS = 720;
export const MAX_SCANS = 4;
export const DEFAULT_SCAN_HZ = 10;
export const FULL_TURN_DEG = 360;

export interface LidarSpec {
  rays: number;
  rangeM: number;
  rateHz: number;
  fovDeg: number;
}

const NUMBER = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const num = (s: string) => Number(s.replace(/,/g, ''));

function row(info: ComponentInfo, ...names: string[]): string | null {
  const found = info.specs?.find(([name]) => names.includes(name.toLowerCase()));

  return found ? specLines(found[1])[0] : null;
}

function rangeOf(info: ComponentInfo): number | null {
  const m = new RegExp(String.raw`(?:${NUMBER}\s*[–-]\s*)?${NUMBER}\s*m\b`).exec(row(info, 'range') ?? '');

  return m ? num(m[2]) : null;
}

function rateOf(info: ComponentInfo): number {
  const m = new RegExp(String.raw`^\s*${NUMBER}\s*(?:[–-]\s*${NUMBER}\s*)?Hz`).exec(
    row(info, 'scan rate', 'rotation') ?? '',
  );

  if (!m) return DEFAULT_SCAN_HZ;

  return m[2] ? Math.min(Math.max(DEFAULT_SCAN_HZ, num(m[1])), num(m[2])) : num(m[1]);
}

function fovOf(info: ComponentInfo): number {
  const over = /over\s*(\d+(?:\.\d+)?)\s*°/.exec(row(info, 'resolution') ?? '');
  const fov = /^\s*(\d+(?:\.\d+)?)\s*°/.exec(row(info, 'fov', 'field of view') ?? '');
  const deg = Number(over?.[1] ?? fov?.[1] ?? FULL_TURN_DEG);

  return Math.min(FULL_TURN_DEG, deg);
}

function samplesOf(info: ComponentInfo, rateHz: number, fovDeg: number): number {
  const sample = new RegExp(String.raw`^\s*${NUMBER}\s*(k?)Hz`).exec(row(info, 'sample rate') ?? '');
  const points = new RegExp(String.raw`^\s*${NUMBER}\s*pts`).exec(row(info, 'point rate') ?? '');
  const step = /^\s*(\d+(?:\.\d+)?)\s*°/.exec(row(info, 'resolution') ?? '');

  if (sample) return (num(sample[1]) * (sample[2] ? 1000 : 1)) / rateHz;

  if (points) return num(points[1]) / rateHz;

  if (step) return fovDeg / Number(step[1]);

  return MAX_SCAN_RAYS;
}

export function lidarSpec(info: ComponentInfo): LidarSpec | null {
  const rangeM = rangeOf(info);

  if (info.group !== 'LiDAR' || !rangeM) return null;

  const rateHz = rateOf(info);
  const fovDeg = fovOf(info);
  const rays = Math.min(MAX_SCAN_RAYS, Math.max(2, Math.round(samplesOf(info, rateHz, fovDeg))));

  return { rays, rangeM, rateHz, fovDeg };
}

const infoOf = (part: ScenePart) =>
  part.kind === 'component' && part.componentId ? COMPONENT_BY_ID[part.componentId] : null;

export const partLidar = (part: ScenePart): LidarSpec | null => {
  const info = infoOf(part);

  return info ? lidarSpec(info) : null;
};

export function scanAngles(spec: Pick<LidarSpec, 'rays' | 'fovDeg'>): number[] {
  const full = spec.fovDeg >= FULL_TURN_DEG;
  const step = full ? FULL_TURN_DEG / spec.rays : spec.fovDeg / Math.max(1, spec.rays - 1);

  return Array.from({ length: spec.rays }, (_, i) => -spec.fovDeg / 2 + i * step);
}

const round = (v: number) => Math.round(v * 1e7) / 1e7;

function sensorFrame(part: ScenePart) {
  const frame = LIDAR_SCAN[part.componentId ?? ''];
  const rotation = eulerToMatrix(part.rotation);
  const origin = new THREE.Vector3(...(frame?.origin ?? [0, 0, 0]))
    .applyMatrix4(rotation)
    .add(new THREE.Vector3(...part.position));
  const forward = new THREE.Vector3(...(frame?.forward ?? [0, 0, 1])).applyMatrix4(rotation).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyMatrix4(rotation).normalize();

  return { origin, forward, left: up.clone().cross(forward).normalize() };
}

export function buildScan(bodies: SimBody[], part: ScenePart): Eye | null {
  const spec = partLidar(part);
  const body = bodies.find((b) => b.parts.includes(part.id));

  if (!spec || !body) return null;

  const { origin, forward, left } = sensorFrame(part);
  const dirs = scanAngles(spec).flatMap((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    const d = forward.clone().multiplyScalar(Math.cos(a)).addScaledVector(left, Math.sin(a));

    return [d.x, -d.z, d.y].map(round);
  });

  return {
    part: part.id,
    body: body.name,
    pos: toMj(origin.sub(new THREE.Vector3(...body.origin))).map(round) as V3,
    dirs,
    cols: spec.rays,
    rows: 1,
    rangeM: spec.rangeM,
    scan: { rateHz: spec.rateHz, fovDeg: spec.fovDeg },
  };
}

export const robotScans = (bodies: SimBody[], parts: ScenePart[]): Eye[] =>
  parts.flatMap((p) => buildScan(bodies, p) ?? []).slice(0, MAX_SCANS);
