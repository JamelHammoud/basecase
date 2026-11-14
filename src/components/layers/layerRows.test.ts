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

  describe('booleans', () => {
    const cut = (id: string, operands: ScenePart[], extra: Partial<ScenePart> = {}) =>
      part(id, { kind: 'boolean', boolean: { op: 'subtract', operands }, ...extra });
    const inner = cut('inner', [part('plate', { name: 'Plate' }), part('slot', { name: 'Slot', role: 'cutout' })]);
    const outer = cut('outer', [inner, part('hole', { name: 'Hole', role: 'cutout' })], { name: 'Bracket' });
    const scene = [part('a'), outer, cut('arm-cut', [part('link'), part('pin')], { group: arm })];
    const rows = (closed = new Set<string>(), query = '') =>
      layerRows(scene, closed, query).map((r) =>
        r.type === 'group' ? `G:${r.name}` : `${r.depth}:${r.part.id}${r.operandOf ? `<${r.operandOf}` : ''}`,
      );

    it('lists operands under their boolean, one level deeper, recursing into nested booleans', () => {
      expect(rows()).toEqual([
        '0:a',
        '0:outer',
        '1:inner<outer',
        '2:plate<inner',
        '2:slot<inner',
        '1:hole<outer',
        'G:Arm',
        '1:arm-cut',
        '2:link<arm-cut',
        '2:pin<arm-cut',
      ]);
      expect(layerRows(scene, new Set())[1]).toMatchObject({ collapsed: false });
      expect(layerRows(scene, new Set())[0]).not.toHaveProperty('collapsed');
    });

    it('hides operands of a collapsed boolean', () => {
      expect(rows(new Set(['outer', 'arm-cut']))).toEqual(['0:a', '0:outer', 'G:Arm', '1:arm-cut']);
      expect(rows(new Set(['inner']))).toEqual([
        '0:a',
        '0:outer',
        '1:inner<outer',
        '1:hole<outer',
        'G:Arm',
        '1:arm-cut',
        '2:link<arm-cut',
        '2:pin<arm-cut',
      ]);
      expect(layerRows(scene, new Set(['outer']))[1]).toMatchObject({ collapsed: true });
    });

    it('finds an operand by name and shows it under its parents, even when collapsed', () => {
      expect(rows(new Set(['outer', 'inner']), 'slot')).toEqual(['0:outer', '1:inner<outer', '2:slot<inner']);
      expect(rows(new Set(), 'hole')).toEqual(['0:outer', '1:hole<outer']);
      expect(rows(new Set(), 'bracket')).toEqual(['0:outer']);
    });

    it('counts only top-level parts', () => {
      expect(layersTitle(scene)).toEqual(['3 parts']);
    });
  });

  it('titles and sizes the scene', () => {
    expect(layersTitle(parts)).toEqual(['4 parts', '1 cutout']);
    expect(overallSize([part('a')])).toEqual([10, 20, 30]);
    expect(overallSize([])).toBeNull();
  });
});
