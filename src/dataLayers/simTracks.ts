import type { Eye } from '../sim/eyes';
import { fromMj } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import { rotate } from '../sim/quat';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import type { ScenePoints } from './messages';
import { listTrack, type DataTrack } from './track';

export const SIM_WORLD = 'world';

export interface ScanSource {
  id: string;
  name: string;
  owner: string;
  eye: Eye;
  body: number;
  offset: number;
}

export const scanLayerId = (part: string) => `scan:${part}`;

export function scanSources(model: SimModel, parts: ScenePart[]): ScanSource[] {
  let offset = 0;

  return (model.scans ?? []).flatMap((eye) => {
    const part = parts.find((p) => p.id === eye.part);
    const body = model.bodies.findIndex((b) => b.name === eye.body);
    const at = offset;

    offset += eye.cols * eye.rows;

    if (body < 0) return [];

    return [
      {
        id: scanLayerId(eye.part),
        name: part?.name ?? eye.part,
        owner: part?.group?.id ?? eye.part,
        eye,
        body,
        offset: at,
      },
    ];
  });
}

export function liveScanPoints(sources: ScanSource[], points: Float32Array, counts: number[] | undefined) {
  let at = 0;

  return sources.map((source, i) => {
    const n = counts?.[i] ?? (i === 0 ? points.length / 3 : 0);
    const slice = points.slice(at * 3, (at + n) * 3);

    at += n;

    return { source, points: slice };
  });
}

export function scanHits(source: ScanSource, values: ArrayLike<number>, poses: ArrayLike<number>): Float32Array {
  const { eye, body, offset } = source;
  const o = body * 7;
  const q = [poses[o + 3], poses[o + 4], poses[o + 5], poses[o + 6]];
  const lens = rotate(q, eye.pos);
  const origin = [poses[o] + lens[0], poses[o + 1] + lens[1], poses[o + 2] + lens[2]];
  const out: number[] = [];

  for (let ray = 0; ray < eye.cols * eye.rows; ray++) {
    const v = values[offset + ray];

    if (v >= 1 || Number.isNaN(v)) continue;

    const d = rotate(q, [eye.dirs[ray * 3], eye.dirs[ray * 3 + 1], eye.dirs[ray * 3 + 2]]);
    const reach = v * eye.rangeM;

    out.push(...fromMj(origin[0] + d[0] * reach, origin[1] + d[1] * reach, origin[2] + d[2] * reach));
  }

  return Float32Array.from(out);
}

function scanFrames(r: Recording, source: ScanSource): number[] {
  const width = r.scanWidth ?? 0;
  const rays = source.eye.cols * source.eye.rows;
  const changed = (n: number) => {
    for (let k = 0; k < rays; k++) {
      if (r.scan![n * width + source.offset + k] !== r.scan![(n - 1) * width + source.offset + k]) return true;
    }

    return false;
  };
  const frames = [0];

  for (let n = 1; n < r.frames; n++) if (changed(n)) frames.push(n);

  return frames;
}

export function recordedScanTrack(r: Recording, source: ScanSource): DataTrack<'scene/Points'> | null {
  const width = r.scanWidth ?? 0;

  if (!r.scan || !width || r.frames < 1) return null;

  const frames = scanFrames(r, source);
  const cache = new Map<number, ScenePoints>();
  const message = (i: number): ScenePoints => {
    const hit = cache.get(i);

    if (hit) return hit;

    const n = frames[i];
    const points = scanHits(source, r.scan!.subarray(n * width, (n + 1) * width), r.poses.subarray(n * r.nbody * 7));

    if (cache.size > 8) cache.clear();

    const made = { points };

    cache.set(i, made);

    return made;
  };

  return {
    id: source.id,
    name: source.name,
    owner: source.owner,
    schema: 'scene/Points',
    version: 0,
    times: frames.map((n) => r.t[n] ?? n * r.dt),
    message,
  };
}

export const liveScanTrack = (source: ScanSource, points: Float32Array, version: number) =>
  listTrack(
    { id: source.id, name: source.name, owner: source.owner, schema: 'scene/Points' },
    [{ at: 0, message: { points } }],
    version,
  );
