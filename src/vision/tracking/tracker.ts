import { centre, overlapRatio } from './geometry';
import { TRACKER_DEFAULTS, type Box, type Track, type TrackInput, type TrackerOptions } from './types';

interface Entry {
  id: number;
  label: string;
  score: number;
  box: Box;
  seenMs: number;
  hits: number;
  missed: number;
  vx: number;
  vy: number;
}

const VELOCITY_BLEND = 0.5;

function predicted(entry: Entry, timestamp: number, lostMs: number): Box {
  const dt = Math.min(lostMs, Math.max(0, timestamp - entry.seenMs));

  return [entry.box[0] + entry.vx * dt, entry.box[1] + entry.vy * dt, entry.box[2], entry.box[3]];
}

function affinity(a: Box, b: Box) {
  const [ax, ay] = centre(a);
  const [bx, by] = centre(b);
  const size = Math.max(a[2], a[3], b[2], b[3], 1e-6);
  const nearness = Math.max(0, 1 - Math.hypot(ax - bx, ay - by) / (3 * size));

  return overlapRatio(a, b) + 0.5 * nearness;
}

const finite = (input: TrackInput) =>
  Number.isFinite(input.score) && input.box.length === 4 && input.box.every(Number.isFinite);

export class ObjectTracker {
  private entries: Entry[] = [];
  private nextId = 1;
  private lastMs = -Infinity;
  private readonly options: TrackerOptions;

  constructor(options: Partial<TrackerOptions> = {}) {
    this.options = { ...TRACKER_DEFAULTS, ...options };
  }

  get size() {
    return this.entries.length;
  }

  reset() {
    this.entries = [];
    this.nextId = 1;
    this.lastMs = -Infinity;
  }

  update(inputs: readonly TrackInput[], timestamp: number): Track[] {
    if (timestamp < this.lastMs) this.reset();

    this.lastMs = timestamp;

    const detections = inputs
      .filter(finite)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.maxDetections);
    const matched = this.associate(detections, timestamp);

    this.age(timestamp);

    detections.forEach((detection, index) => {
      if (!matched.has(index)) this.start(detection, timestamp);
    });

    return this.confirmed();
  }

  private associate(detections: readonly TrackInput[], timestamp: number) {
    const pairs: { entry: Entry; index: number; value: number }[] = [];

    for (const entry of this.entries) {
      const guess = predicted(entry, timestamp, this.options.lostMs);

      detections.forEach((detection, index) => {
        if (detection.label !== entry.label) return;

        const value = affinity(guess, detection.box);

        if (value >= this.options.gate) pairs.push({ entry, index, value });
      });
    }

    pairs.sort((a, b) => b.value - a.value);

    const taken = new Set<Entry>();
    const matched = new Set<number>();

    for (const { entry, index } of pairs) {
      if (taken.has(entry) || matched.has(index)) continue;

      taken.add(entry);
      matched.add(index);
      this.follow(entry, detections[index], timestamp);
    }

    for (const entry of this.entries) if (!taken.has(entry)) entry.missed++;

    return matched;
  }

  private follow(entry: Entry, detection: TrackInput, timestamp: number) {
    const dt = timestamp - entry.seenMs;
    const [px, py] = [entry.box[0], entry.box[1]];

    if (dt > 0) {
      entry.vx = VELOCITY_BLEND * ((detection.box[0] - px) / dt) + (1 - VELOCITY_BLEND) * entry.vx;
      entry.vy = VELOCITY_BLEND * ((detection.box[1] - py) / dt) + (1 - VELOCITY_BLEND) * entry.vy;
    }

    entry.box = detection.box;
    entry.score = detection.score;
    entry.seenMs = timestamp;
    entry.hits++;
    entry.missed = 0;
  }

  private age(timestamp: number) {
    const { lostMs, maxMisses, minHits } = this.options;

    this.entries = this.entries.filter(
      (entry) =>
        entry.missed === 0 ||
        (entry.hits >= minHits && entry.missed <= maxMisses && timestamp - entry.seenMs <= lostMs),
    );
  }

  private start(detection: TrackInput, timestamp: number) {
    if (this.entries.length >= this.options.maxTracks && !this.evict()) return;

    this.entries.push({
      id: this.nextId++,
      label: detection.label,
      score: detection.score,
      box: detection.box,
      seenMs: timestamp,
      hits: 1,
      missed: 0,
      vx: 0,
      vy: 0,
    });
  }

  private evict() {
    const lost = this.entries.filter((entry) => entry.missed > 0).sort((a, b) => a.seenMs - b.seenMs)[0];

    if (!lost) return false;

    this.entries.splice(this.entries.indexOf(lost), 1);

    return true;
  }

  private confirmed(): Track[] {
    return this.entries
      .filter((entry) => entry.hits >= this.options.minHits)
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        score: entry.score,
        box: entry.box,
        seenMs: entry.seenMs,
        hits: entry.hits,
        missed: entry.missed,
        coasting: entry.missed > 0,
      }));
  }
}
