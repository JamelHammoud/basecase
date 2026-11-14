import * as THREE from 'three';
import { drawTrack, freshDraw, type FrameAxes, type LayerDraw } from '../../dataLayers/draw';
import { MAX_POINTS, sinkCapacity } from '../../dataLayers/pointSink';
import { segmentCount, shapeCount } from '../../dataLayers/shapes';
import type { DataLayerInput } from '../../dataLayers/store';
import { treeAt } from '../../dataLayers/tf';
import { kindOf, spanAt, type DataKind, type DataTrack } from '../../dataLayers/track';
import { EMPTY_TREE, type TfTree } from './dataFrames';
import { LayerMeshes } from './dataLayerMeshes';

export interface DataLayerState {
  id: string;
  name: string;
  kind: DataKind;
  visible: boolean;
  points: number;
  shapes: number;
  segments: number;
  grid: boolean;
  axes: number;
  missing: string | null;
  shownAt: number | null;
}

interface Entry {
  meshes: LayerMeshes;
  key: string;
  drawn: DataTrack | null;
  state: DataLayerState;
  axes: FrameAxes[];
}

const SCENE_FRAMED = new Set<DataTrack['schema']>(['scene/Points']);

function drawKey(track: DataTrack, input: DataLayerInput, hasTf: boolean): string {
  const span = spanAt(track, input.at);
  const framed = SCENE_FRAMED.has(track.schema) ? '' : `${input.anchorsVersion}|${hasTf ? input.at : ''}`;
  const moving = track.schema === 'tf2_msgs/TFMessage' ? input.at : '';

  return `${track.version}|${span?.from}:${span?.to}|${input.colorBy.get(track.id) ?? ''}|${framed}|${moving}`;
}

const hiddenState = (track: DataTrack): DataLayerState => ({
  id: track.id,
  name: track.name,
  kind: kindOf(track),
  visible: false,
  points: 0,
  shapes: 0,
  segments: 0,
  grid: false,
  axes: 0,
  missing: null,
  shownAt: null,
});

export class DataLayers {
  readonly group = new THREE.Group();

  private readonly entries = new Map<string, Entry>();

  constructor(overlays: THREE.Group) {
    this.group.name = 'data-layers';
    overlays.add(this.group);
  }

  update(input: DataLayerInput | null): boolean {
    const tracks = input?.tracks ?? [];
    const live = new Set(tracks.map((t) => t.id));
    let changed = false;

    for (const [id, entry] of this.entries) {
      if (live.has(id)) continue;

      entry.meshes.dispose();
      this.entries.delete(id);
      changed = true;
    }

    if (!input) return changed;

    const hasTf = tracks.some((t) => t.schema === 'tf2_msgs/TFMessage');
    const tree = hasTf ? treeAt(tracks, input.at) : EMPTY_TREE;

    for (const track of tracks) changed = this.updateTrack(track, input, tree, hasTf) || changed;

    return changed;
  }

  state(): DataLayerState[] {
    return [...this.entries.values()].map((e) => e.state);
  }

  frames(): FrameAxes[] {
    return [...this.entries.values()].flatMap((e) => (e.state.visible ? e.axes : []));
  }

  gridTexels(id: string): Uint8Array | null {
    return this.entries.get(id)?.meshes.gridTexels ?? null;
  }

  pointBuffer(id: string): Float32Array | null {
    return this.entries.get(id)?.meshes.points.sink.positions ?? null;
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.meshes.dispose();

    this.entries.clear();
    this.group.removeFromParent();
  }

  private entryFor(track: DataTrack): Entry {
    const known = this.entries.get(track.id);

    if (known) return known;

    const meshes = new LayerMeshes(kindOf(track) === 'scan');
    const entry = { meshes, key: '', drawn: null, state: hiddenState(track), axes: [] };

    this.group.add(meshes.group);
    this.entries.set(track.id, entry);

    return entry;
  }

  private updateTrack(track: DataTrack, input: DataLayerInput, tree: TfTree, hasTf: boolean): boolean {
    const entry = this.entryFor(track);
    const visible = !input.hidden.has(track.id);

    if (!visible) {
      const was = entry.meshes.group.visible;

      entry.meshes.group.visible = false;
      entry.state = hiddenState(track);
      entry.key = '';
      entry.drawn = null;

      return was;
    }

    const key = drawKey(track, input, hasTf);

    entry.meshes.group.visible = true;

    if (key === entry.key && track === entry.drawn) return false;

    const draw = this.drawInto(entry, track, {
      at: input.at,
      tree,
      anchors: input.anchors,
      colorBy: input.colorBy.get(track.id) ?? null,
    });

    entry.key = key;
    entry.drawn = track;
    entry.meshes.show(draw);
    entry.axes = draw.axes;
    entry.state = {
      id: track.id,
      name: track.name,
      kind: kindOf(track),
      visible: true,
      points: draw.sink.count,
      shapes: shapeCount(draw.shapes),
      segments: segmentCount(draw.shapes),
      grid: !!draw.grid,
      axes: draw.axes.length,
      missing: draw.missing,
      shownAt: draw.shownAt,
    };

    return true;
  }

  private drawInto(entry: Entry, track: DataTrack, ctx: Parameters<typeof drawTrack>[1]): LayerDraw {
    const { points } = entry.meshes;

    for (;;) {
      const draw = freshDraw(points.sink);

      drawTrack(track, ctx, draw);

      const capacity = sinkCapacity(points.sink);

      if (draw.sink.count < capacity || capacity >= MAX_POINTS) return draw;

      points.grow(Math.min(MAX_POINTS, capacity * 4));
    }
  }
}
