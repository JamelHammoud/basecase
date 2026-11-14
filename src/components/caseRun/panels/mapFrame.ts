import type { Series } from '../../../cases/console/signalBus';
import { extent, scaler } from './series';

export const MAP_SIZE = 240;

const MARGIN_MM = 150;

export interface MapObject {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
}

export interface MapFrame {
  px: (v: number) => number;
  pz: (v: number) => number;
  k: number;
  points: string;
}

const framed = new WeakMap<Series, { key: string; frame: MapFrame }>();

function frameOf(xs: Series, zs: Series, objects: MapObject[]): MapFrame {
  const [x0, x1] = extent([...xs.v, ...objects.flatMap((o) => [o.x - o.w / 2, o.x + o.w / 2])], 0);
  const [z0, z1] = extent([...zs.v, ...objects.flatMap((o) => [o.z - o.d / 2, o.z + o.d / 2])], 0);
  const span = Math.max(x1 - x0, z1 - z0) + MARGIN_MM * 2;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const px = scaler([cx - span / 2, cx + span / 2], [0, MAP_SIZE]);
  const pz = scaler([cz - span / 2, cz + span / 2], [0, MAP_SIZE]);

  return {
    px,
    pz,
    k: MAP_SIZE / span,
    points: xs.v.map((v, i) => `${px(v).toFixed(1)},${pz(zs.v[i] ?? 0).toFixed(1)}`).join(' '),
  };
}

export function mapFrame(path: { xs: Series; zs: Series; whole: boolean }, objects: MapObject[]): MapFrame {
  const { xs, zs, whole } = path;
  const key = objects.map((o) => `${o.id}:${o.x}:${o.z}:${o.w}:${o.d}`).join('|');
  const held = whole ? framed.get(xs) : undefined;

  if (held?.key === key) return held.frame;

  const frame = frameOf(xs, zs, objects);

  if (whole) framed.set(xs, { key, frame });

  return frame;
}
