import { RegionCounter } from './regions';
import { ObjectTracker } from './tracker';
import type { CameraRegions, TrackInput, TrackerOptions, TrackingSnapshot } from './types';

const NO_REGIONS: CameraRegions = { zones: [], lines: [] };
const MAX_CAMERAS = 64;

interface CameraState {
  tracker: ObjectTracker;
  counter: RegionCounter;
  regions: CameraRegions;
  key: string;
  lastMs: number;
}

export class TrackingSession {
  private readonly cameras = new Map<string, CameraState>();
  private readonly options: Partial<TrackerOptions>;
  private readonly limit: number;

  constructor(options: Partial<TrackerOptions> = {}, limit = MAX_CAMERAS) {
    this.options = options;
    this.limit = limit;
  }

  get size() {
    return this.cameras.size;
  }

  configure(camera: string, regions: CameraRegions | undefined) {
    const next = regions ?? NO_REGIONS;
    const state = this.state(camera);

    if (state.regions === next) return;

    const key = JSON.stringify(next);

    if (state.key === key) {
      state.regions = next;

      return;
    }

    state.regions = next;
    state.key = key;
    state.counter = new RegionCounter(next);
  }

  update(camera: string, inputs: readonly TrackInput[], timestamp: number): TrackingSnapshot {
    const state = this.state(camera);

    if (timestamp < state.lastMs) state.counter = new RegionCounter(state.regions);

    state.lastMs = timestamp;

    const tracks = state.tracker.update(inputs, timestamp);

    return { tracks, ...state.counter.update(tracks, timestamp) };
  }

  reset(camera: string) {
    const state = this.cameras.get(camera);

    if (!state) return;

    state.tracker.reset();
    state.counter = new RegionCounter(state.regions);
    state.lastMs = -Infinity;
  }

  remove(camera: string) {
    this.cameras.delete(camera);
  }

  removeWhere(match: (camera: string) => boolean) {
    for (const camera of [...this.cameras.keys()]) if (match(camera)) this.cameras.delete(camera);
  }

  clear() {
    this.cameras.clear();
  }

  private state(camera: string): CameraState {
    const existing = this.cameras.get(camera);

    if (existing) {
      this.cameras.delete(camera);
      this.cameras.set(camera, existing);

      return existing;
    }

    const state: CameraState = {
      tracker: new ObjectTracker(this.options),
      counter: new RegionCounter(NO_REGIONS),
      regions: NO_REGIONS,
      key: JSON.stringify(NO_REGIONS),
      lastMs: -Infinity,
    };

    this.cameras.set(camera, state);

    while (this.cameras.size > this.limit) this.cameras.delete(this.cameras.keys().next().value!);

    return state;
  }
}
