import { centre, insidePolygon, segmentsMeet, sideOf } from './geometry';
import type { CameraRegions, LineReading, Point, Track, ZoneReading } from './types';

const DEADBAND = 0.004;
const RECENT = 8;

interface Crossing {
  side: number;
  point: Point;
}

const sign = (value: number) => {
  if (value > DEADBAND) return 1;

  return value < -DEADBAND ? -1 : 0;
};
const keep = (next: Map<number, Crossing>, id: number, previous: Crossing | undefined) => {
  if (previous) next.set(id, previous);
};
const wanted = (filter: string | undefined, track: Track) => filter === undefined || filter === track.label;

export class RegionCounter {
  private readonly regions: CameraRegions;
  private readonly entered = new Map<string, Map<number, number>>();
  private readonly sides = new Map<string, Map<number, Crossing>>();
  private readonly counts = new Map<string, { in: number; out: number; recent: LineReading['recent'] }>();

  constructor(regions: CameraRegions) {
    this.regions = regions;
  }

  get empty() {
    return !this.regions.zones.length && !this.regions.lines.length;
  }

  update(tracks: readonly Track[], timestamp: number): { zones: ZoneReading[]; lines: LineReading[] } {
    return {
      zones: this.regions.zones.map((zone) => this.zone(zone, tracks, timestamp)),
      lines: this.regions.lines.map((line) => this.line(line, tracks, timestamp)),
    };
  }

  private zone(zone: CameraRegions['zones'][number], tracks: readonly Track[], timestamp: number): ZoneReading {
    const before = this.entered.get(zone.name) ?? new Map<number, number>();
    const now = new Map<number, number>();

    for (const track of tracks) {
      if (wanted(zone.label, track) && insidePolygon(centre(track.box), zone.points))
        now.set(track.id, before.get(track.id) ?? timestamp);
    }

    this.entered.set(zone.name, now);

    const longest = Math.max(0, ...[...now.values()].map((start) => timestamp - start));

    return { name: zone.name, count: now.size, dwell: longest / 1000, ids: [...now.keys()] };
  }

  private line(line: CameraRegions['lines'][number], tracks: readonly Track[], timestamp: number): LineReading {
    const known = this.sides.get(line.name) ?? new Map<number, Crossing>();
    const next = new Map<number, Crossing>();
    const total = this.counts.get(line.name) ?? { in: 0, out: 0, recent: [] };

    for (const track of tracks) {
      const previous = known.get(track.id);

      if (track.coasting) {
        keep(next, track.id, previous);

        continue;
      }

      if (!wanted(line.label, track)) continue;

      const point = centre(track.box);
      const side = sign(sideOf(point, line.from, line.to));
      const state = side || !previous ? { side, point } : previous;

      const flipped = !!previous && previous.side !== 0 && side !== 0 && side !== previous.side;

      if (flipped && segmentsMeet(previous.point, point, line.from, line.to))
        this.cross(total, track.id, side, timestamp);

      next.set(track.id, state);
    }

    this.sides.set(line.name, next);
    this.counts.set(line.name, total);

    return { name: line.name, in: total.in, out: total.out, recent: [...total.recent] };
  }

  private cross(
    total: { in: number; out: number; recent: LineReading['recent'] },
    id: number,
    side: number,
    at: number,
  ) {
    const direction = side > 0 ? 'in' : 'out';

    total[direction]++;
    total.recent.push({ id, direction, at });

    if (total.recent.length > RECENT) total.recent.shift();
  }
}
