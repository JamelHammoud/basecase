import * as THREE from 'three';
import { HEX_NUT, heatInsert, isMetric, THREAD, WASHER, type MetricSize } from '../data/hardware';
import type { Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { toScene, type V3 } from './agentFrame';
import { partSpans } from './axisHits';
import { findPort, worldPort } from './ports';

export const RAY_BACKOFF = 300;

export interface FastenAxis {
  origin: V3;
  up: V3;
  dir: V3;
  port?: { part: ScenePart; port: Port; t: number };
}

export interface Layer {
  part: ScenePart;
  enter: number;
  exit: number;
}

export const at = (axis: FastenAxis, t: number): V3 => [0, 1, 2].map((k) => axis.origin[k] + axis.dir[k] * t) as V3;

function unit(v: V3): V3 {
  const n = Math.hypot(...v) || 1;

  return v.map((x) => x / n) as V3;
}

function axisFrom(point: V3, up: V3): FastenAxis {
  const u = unit(up);

  return {
    origin: point.map((x, k) => x + u[k] * RAY_BACKOFF) as V3,
    up: u,
    dir: u.map((x) => -x) as V3,
  };
}

export function resolveAxis(parts: ScenePart[], args: { into: string; at?: V3; from?: V3 }): FastenAxis | string {
  const [partId, portName] = args.into.includes(':') ? args.into.split(':') : [];

  if (!partId && (!args.at || !args.from))
    return 'Give at and from: a point on the screw axis and the side the head is on.';

  if (!partId) return axisFrom(toScene(args.at!), toScene(args.from!));

  const part = parts.find((p) => p.id === partId);
  const port = part && findPort(part, portName);

  if (!part || !port) return `No port "${portName}" on ${partId}. get_ports lists them.`;

  const w = worldPort(part, port);

  return { ...axisFrom(w.position, w.axis), port: { part, port, t: RAY_BACKOFF } };
}

export function stackLayers(axis: FastenAxis, through: ScenePart[]): Layer[] | string {
  const layers: Layer[] = [];
  let after = -Infinity;

  for (const part of through) {
    const span = partSpans(part, axis.origin, axis.dir).find(([enter]) => enter >= after - 0.05);

    if (!span) return `The screw axis misses ${part.id}${layers.length ? ` after ${layers.at(-1)!.part.id}` : ''}.`;

    layers.push({ part, enter: span[0], exit: span[1] });
    after = span[1];
  }

  return layers;
}

export type Into = 'insert' | 'nut' | 'port';

export interface LengthNeed {
  min: number;
  max: number;
  prefer: 'shortest' | 'longest';
  grip: number;
  engage: string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function lengthNeed(into: Into, ctx: { size: MetricSize; head: number; layers: Layer[]; axis: FastenAxis }) {
  const { size, head, layers, axis } = ctx;
  const d = THREAD[size].d;
  const last = layers.at(-1)!;

  if (into === 'insert') {
    const ins = heatInsert({ size });
    const grip = last.enter - head;

    return {
      grip,
      min: grip + ins.l,
      max: last.exit - head - 0.5,
      prefer: 'shortest' as const,
      engage: `${ins.l} mm insert`,
    };
  }

  if (into === 'nut') {
    const grip = last.exit - head;

    return {
      grip,
      min: grip + HEX_NUT[size]!.m + 2 * THREAD[size].pitch,
      max: Infinity,
      prefer: 'shortest' as const,
      engage: 'nut',
    };
  }

  const grip = axis.port!.t - head;
  const depth = axis.port!.port.depthMm ?? 1.5 * d;

  return {
    grip,
    min: grip + Math.min(1.5 * d, depth),
    max: grip + depth,
    prefer: 'longest' as const,
    engage: `${r1(depth)} mm deep thread`,
  };
}

export function pickLength(stock: number[], need: LengthNeed): number | null {
  const fits = stock.filter((l) => l >= need.min - 0.05 && l <= need.max + 0.05);

  if (fits.length) return need.prefer === 'shortest' ? fits[0] : fits[fits.length - 1];

  return null;
}

export const washerHeight = (size: MetricSize) => WASHER[size]?.h ?? 0.5;

export const metricSize = (size: string): MetricSize | null => (isMetric(size) ? size : null);

export function upRotation(up: V3): THREE.Euler {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...up));

  return new THREE.Euler().setFromQuaternion(q, 'XYZ');
}
