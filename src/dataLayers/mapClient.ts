import type { MapWorldRequest } from './mapWorld';
import type { Recording } from '../sim/recorder';
import { workerClient } from '../utils/workerRpc';
import { mapJobs, type MapJobs } from './mapJobs';
import type { MapCloud } from './messages';
import type { ScanSource } from './simTracks';
import { listTrack, type DataTrack } from './track';

export const MAP_LAYER = 'map';

let localJobs: MapJobs | null = null;

const client = workerClient<MapJobs>(
  () => new Worker(new URL('./map.worker.ts', import.meta.url), { type: 'module' }),
  async () => (localJobs ??= mapJobs()),
);

export const makeMapWorld = (request: MapWorldRequest) => client.call('makeWorld', request);

const built = new WeakMap<object, Map<string, Promise<MapCloud | null>>>();

const simScans = (r: Recording, sources: ScanSource[]) =>
  r.scan && r.scanWidth && sources.length
    ? {
        recording: {
          scan: r.scan,
          scanWidth: r.scanWidth,
          poses: r.poses,
          nbody: r.nbody,
          frames: r.frames,
          t: r.t,
          dt: r.dt,
        },
        sources,
      }
    : null;

export function tryMap(recording: Recording, sources: ScanSource[], matching = true): Promise<MapCloud | null> {
  const key = recording;
  const choices = built.get(key) ?? new Map<string, Promise<MapCloud | null>>();
  const choice = `${matching}|${JSON.stringify(sources)}`;
  const known = choices.get(choice);

  if (known) return known;

  const made = client
    .call('tryMap', {
      topics: recording.topics ?? null,
      sim: simScans(recording, sources),
      options: { match: matching },
    })
    .catch(() => null);

  if (choices.size >= 4) choices.delete(choices.keys().next().value!);

  choices.set(choice, made);
  built.set(key, choices);

  return made;
}

export const mapTrack = (cloud: MapCloud, version = 0): DataTrack<'scene/Map'> =>
  listTrack({ id: MAP_LAYER, name: 'Map', schema: 'scene/Map' }, [{ at: 0, message: cloud }], version);

let sessions = 0;

export class LiveMap {
  private readonly session = ++sessions;

  private points = new Float32Array(4096 * 3);

  private count = 0;

  private ended = false;

  private low = Infinity;

  private high = -Infinity;

  async add(hits: Float32Array): Promise<boolean> {
    if (this.ended) return false;

    const growth = await client.call('liveHits', { session: this.session, hits });

    if (this.ended || !growth.points.length) return false;

    this.room(growth.count);

    for (let i = 0; i < growth.indices.length; i++) {
      this.points.set(growth.points.subarray(i * 3, i * 3 + 3), growth.indices[i] * 3);
      this.low = Math.min(this.low, growth.points[i * 3 + 2]);
      this.high = Math.max(this.high, growth.points[i * 3 + 2]);
    }

    this.count = growth.count;

    return true;
  }

  cloud(): MapCloud {
    return {
      frame: null,
      points: this.points.slice(0, this.count * 3),
      low: Number.isFinite(this.low) ? this.low : 0,
      high: Number.isFinite(this.high) ? this.high : 0,
    };
  }

  end(): void {
    this.ended = true;
    void client.call('liveEnd', { session: this.session }).catch(() => {});
  }

  private room(count: number) {
    const needed = count * 3;

    if (needed <= this.points.length) return;

    const grown = new Float32Array(Math.max(needed, this.points.length * 2));

    grown.set(this.points.subarray(0, this.count * 3));
    this.points = grown;
  }
}
