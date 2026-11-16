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

  it('keeps shared insertion boundaries, nested operands and loose layers in source order', () => {
    const rows = [
      { type: 'group' as const, id: 'rover', name: 'Rover', members: parts },
      { type: 'part' as const, part: parts[1], depth: 1 },
      { type: 'part' as const, part: part('operand'), depth: 2, operandOf: 'chassis' },
      { type: 'part' as const, part: part('nested'), depth: 3, operandOf: 'operand' },
      { type: 'part' as const, part: parts[3], depth: 0 },
    ];
    const layers = [
      layer('loose'),
      layer('robot first', 'rover'),
      layer('nested scan', 'nested'),
      layer('chassis scan', 'chassis'),
      layer('robot last', 'rover'),
      layer('missing owner', 'missing'),
      layer('box scan', 'box'),
    ];

    Object.freeze(rows);
    Object.freeze(layers);
    expect(names(withDataRows(rows, layers, { collapsed: new Set(), query: '' }))).toEqual([
      'G:Rover',
      'chassis',
      'operand',
      'nested',
      'D1:robot first',
      'D4:nested scan',
      'D2:chassis scan',
      'D1:robot last',
      'box',
      'D1:box scan',
      'D0:loose',
      'D0:missing owner',
    ]);
    expect(names(withDataRows(rows, layers, { collapsed: new Set(['rover']), query: ' ROBOT last ' }))).toEqual([
      'G:Rover',
      'chassis',
      'operand',
      'nested',
      'D1:robot last',
      'box',
    ]);
    expect(names(withDataRows([], layers, { collapsed: new Set(['rover']), query: '' }))).toEqual([
      'D0:loose',
      'D0:nested scan',
      'D0:chassis scan',
      'D0:missing owner',
      'D0:box scan',
    ]);
  });

  it('reads scene owners a bounded number of times across many sensor layers', () => {
    let reads = 0;
    const scene = Array.from({ length: 200 }, (_, i) => {
      const value = part(`part-${i}`, { group: { id: `robot-${i}`, name: `Robot ${i}` } });

      return new Proxy(value, {
        get(target, key, receiver) {
          if (key === 'id' || key === 'group') reads++;

          return Reflect.get(target, key, receiver);
        },
      });
    });
    const rows = layerRows(scene, new Set());
    const layers = Array.from({ length: 1000 }, (_, i) => layer(`scan-${i}`, `robot-${i % 200}`));

    reads = 0;

    const result = withDataRows(rows, layers, { collapsed: new Set(), query: '' });

    expect(result).toHaveLength(rows.length + layers.length);
    expect(reads).toBeLessThanOrEqual(scene.length * 3);
    expect(names(result).slice(0, 8)).toEqual([
      'G:Robot 0',
      'part-0',
      'D1:scan-0',
      'D1:scan-200',
      'D1:scan-400',
      'D1:scan-600',
      'D1:scan-800',
      'G:Robot 1',
    ]);
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
