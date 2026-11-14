import type { FrameAnchors } from '../three/viewport/dataFrames';
import { cloudFields, scanFields } from './points';
import { kindOf, type DataKind, type DataTrack } from './track';

export interface DataLayerRow {
  id: string;
  name: string;
  kind: DataKind;
  owner?: string;
  visible: boolean;
  colorBy: string | null;
  fields: string[];
  missing: string | null;
}

export interface DataLayerInput {
  tracks: DataTrack[];
  hidden: ReadonlySet<string>;
  colorBy: ReadonlyMap<string, string>;
  at: number | null;
  anchors: FrameAnchors;
  anchorsVersion: number;
}

export interface DrawnLayer {
  id: string;
  missing: string | null;
}

const NO_ANCHORS: FrameAnchors = { links: new Map(), base: null };

function fieldsOf(track: DataTrack): string[] {
  const last = track.times.length - 1;

  if (last < 0) return [];

  if (track.schema === 'sensor_msgs/PointCloud2')
    return cloudFields(track.message(last) as Parameters<typeof cloudFields>[0]);

  if (track.schema === 'sensor_msgs/LaserScan')
    return scanFields(track.message(last) as Parameters<typeof scanFields>[0]);

  return [];
}

export class DataLayerStore {
  private readonly tracks = new Map<string, DataTrack>();

  private readonly hidden = new Set<string>();

  private readonly colorBy = new Map<string, string>();

  private readonly missing = new Map<string, string>();

  private readonly listeners = new Set<() => void>();

  private readonly drawers = new Set<() => void>();

  private at: number | null = null;

  private anchors: FrameAnchors = NO_ANCHORS;

  private anchorsVersion = 0;

  private listed: DataLayerRow[] = [];

  private listStale = false;

  subscribe = (listen: () => void) => {
    this.listeners.add(listen);

    return () => {
      this.listeners.delete(listen);
    };
  };

  subscribeDraw = (draw: () => void) => {
    this.drawers.add(draw);

    return () => {
      this.drawers.delete(draw);
    };
  };

  rows = (): DataLayerRow[] => {
    if (!this.listStale) return this.listed;

    this.listStale = false;
    this.listed = [...this.tracks.values()].map((t) => ({
      id: t.id,
      name: t.name,
      kind: kindOf(t),
      owner: t.owner,
      visible: !this.hidden.has(t.id),
      colorBy: this.colorBy.get(t.id) ?? null,
      fields: fieldsOf(t),
      missing: this.missing.get(t.id) ?? null,
    }));

    return this.listed;
  };

  input(): DataLayerInput {
    return {
      tracks: [...this.tracks.values()],
      hidden: this.hidden,
      colorBy: this.colorBy,
      at: this.at,
      anchors: this.anchors,
      anchorsVersion: this.anchorsVersion,
    };
  }

  playhead(): number | null {
    return this.at;
  }

  track(id: string): DataTrack | undefined {
    return this.tracks.get(id);
  }

  setTrack(track: DataTrack): void {
    const before = this.tracks.get(track.id);

    this.tracks.set(track.id, track);

    if (!before || before.name !== track.name || before.schema !== track.schema) this.listChanged();

    this.redraw();
  }

  removeTracks(drop: (track: DataTrack) => boolean): void {
    const gone = [...this.tracks.values()].filter(drop);

    if (!gone.length) return;

    for (const t of gone) {
      this.tracks.delete(t.id);
      this.missing.delete(t.id);
    }

    this.listChanged();
    this.redraw();
  }

  setPlayhead(at: number | null): void {
    if (at === this.at) return;

    this.at = at;
    this.redraw();
  }

  setAnchors(anchors: FrameAnchors): void {
    this.anchors = anchors;
    this.anchorsVersion++;
    this.redraw();
  }

  setVisible(id: string, visible: boolean): void {
    if (visible === !this.hidden.has(id)) return;

    if (visible) this.hidden.delete(id);
    else this.hidden.add(id);

    this.listChanged();
    this.redraw();
  }

  setColorBy(id: string, field: string | null): void {
    if (field) this.colorBy.set(id, field);
    else this.colorBy.delete(id);

    this.listChanged();
    this.redraw();
  }

  noteDrawn(drawn: DrawnLayer[]): void {
    let changed = false;

    for (const { id, missing } of drawn) {
      if ((this.missing.get(id) ?? null) === missing) continue;

      if (missing) this.missing.set(id, missing);
      else this.missing.delete(id);

      changed = true;
    }

    if (changed) this.listChanged();
  }

  private listChanged() {
    this.listStale = true;
    this.listeners.forEach((listen) => listen());
  }

  private redraw() {
    this.drawers.forEach((draw) => draw());
  }
}
