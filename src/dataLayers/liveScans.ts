import type { DataLayerStore } from './store';
import { liveScanTrack, type ScanSource } from './simTracks';
import type { DataTrack } from './track';

const SAME_MM = 0.01;

export interface LiveScan {
  source: ScanSource;
  points: Float32Array;
}

export function sameHits(next: Float32Array, shown: Float32Array): boolean {
  if (next.length !== shown.length) return false;

  for (let i = 0; i < next.length; i++) if (Math.abs(next[i] - shown[i]) > SAME_MM) return false;

  return true;
}

export class LiveScans {
  private readonly store: DataLayerStore;

  private readonly shown = new Map<string, DataTrack<'scene/Points'>>();

  private version = 0;

  constructor(store: DataLayerStore) {
    this.store = store;
  }

  set(scans: LiveScan[]): void {
    this.version++;

    for (const { source, points } of scans) {
      if (this.stillShown(source.id, points)) continue;

      const track = liveScanTrack(source, points, this.version);

      this.shown.set(source.id, track);
      this.store.setTrack(track);
    }
  }

  private stillShown(id: string, points: Float32Array): boolean {
    const last = this.shown.get(id);

    return !!last && this.store.track(id) === last && sameHits(points, last.message(0).points);
  }
}
