import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { layerRows, layersTitle, overallSize } from './layerRows';

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

describe('layerRows', () => {
  const arm = { id: 'g1', name: 'Arm' };
  const parts = [part('a'), part('b', { group: arm }), part('c', { group: arm }), part('d', { role: 'cutout' })];

  it('lists a group once, with its members under it, in scene order', () => {
    expect(layerRows(parts, new Set()).map((r) => (r.type === 'group' ? `G:${r.name}` : r.part.id))).toEqual([
      'a',
      'G:Arm',
      'b',
      'c',
      'd',
    ]);
  });

  it('hides members of collapsed groups', () => {
    expect(layerRows(parts, new Set(['g1'])).map((r) => r.type)).toEqual(['part', 'group', 'part']);
  });

  it('filters by part and group name, showing matching members under their group', () => {
    const named = [
      part('a', { name: 'Base plate' }),
      part('b', { name: 'Upper link', group: arm }),
      part('c', { name: 'Servo', group: arm }),
      part('d', { name: 'Servo horn' }),
    ];
    const ids = (query: string, closed = new Set<string>()) =>
      layerRows(named, closed, query).map((r) => (r.type === 'group' ? `G:${r.name}` : r.part.id));

    expect(ids('servo')).toEqual(['G:Arm', 'c', 'd']);
    expect(ids('arm', new Set(['g1']))).toEqual(['G:Arm', 'b', 'c']);
    expect(ids('servo horn')).toEqual(['d']);
    expect(ids('wheel')).toEqual([]);
    expect(layerRows(named, new Set(), 'servo')[0]).toMatchObject({ members: [named[1], named[2]] });
  });

  it('titles and sizes the scene', () => {
    expect(layersTitle(parts)).toEqual(['4 parts', '1 cutout']);
    expect(overallSize([part('a')])).toBe('10 × 20 × 30');
    expect(overallSize([])).toBeNull();
  });
});
