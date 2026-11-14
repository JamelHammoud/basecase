import { describe, expect, it } from 'vitest';
import { DataLayerStore, type DataLayerRow } from '../../dataLayers/store';
import { listTrack } from '../../dataLayers/track';
import type { ScenePart } from '../../types/robotics';
import { withDataRows } from './dataRows';
import { layerRows } from './layerRows';

const part = (id: string, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 20, depth: 30 },
  color: '#888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const layer = (id: string, owner?: string): DataLayerRow => ({
  id,
  name: id,
  kind: 'scan',
  owner,
  visible: true,
  colorBy: null,
  fields: [],
  missing: null,
});

const rover = { id: 'rover', name: 'Rover' };
const parts = [part('floor'), part('chassis', { group: rover }), part('lidar', { group: rover }), part('box')];
const names = (rows: ReturnType<typeof withDataRows>) =>
  rows.map((r) => {
    if (r.type === 'data') return `D${r.depth}:${r.layer.name}`;

    return r.type === 'group' ? `G:${r.name}` : r.part.id;
  });

describe('data layers in Layers', () => {
  it('lists a robot’s layers under its parts and the rest at the end', () => {
    const rows = withDataRows(layerRows(parts, new Set()), [layer('/scan', 'rover'), layer('/map')], {
      collapsed: new Set(),
      query: '',
    });

    expect(names(rows)).toEqual(['floor', 'G:Rover', 'chassis', 'lidar', 'D1:/scan', 'box', 'D0:/map']);
  });

  it('hides them with a collapsed robot and finds them by name', () => {
    const collapsed = new Set(['rover']);
    const layers = [layer('/scan', 'rover'), layer('/map')];

    expect(names(withDataRows(layerRows(parts, collapsed), layers, { collapsed, query: '' }))).not.toContain(
      'D1:/scan',
    );
    expect(names(withDataRows(layerRows(parts, collapsed, 'scan'), layers, { collapsed, query: 'scan' }))).toEqual([
      'D0:/scan',
    ]);
  });
});

describe('the data layer store', () => {
  it('lists a track once, with its visibility and the frame it couldn’t find', () => {
    const store = new DataLayerStore();
    let listed = 0;

    store.subscribe(() => listed++);
    store.setTrack(listTrack({ id: 's', name: '/scan', schema: 'scene/Points' }, [], 1));
    store.setTrack(listTrack({ id: 's', name: '/scan', schema: 'scene/Points' }, [], 2));
    expect(listed).toBe(1);

    store.setVisible('s', false);
    store.noteDrawn([{ id: 's', missing: 'laser' }]);
    expect(store.rows()).toEqual([expect.objectContaining({ id: 's', visible: false, missing: 'laser' })]);
    expect(store.input().hidden.has('s')).toBe(true);

    store.removeTracks(() => true);
    expect(store.rows()).toEqual([]);
  });
});
