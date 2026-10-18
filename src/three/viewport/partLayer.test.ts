import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { PartLayer, onlyTransformChanged } from './partLayer';

const part = (id: string, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const layerWith = (parts: ScenePart[], selected: string[] = []) => {
  const layer = new PartLayer(new THREE.Group());

  layer.sync(parts, new Set(selected), 0);
  layer.buildPending();

  return layer;
};

describe('PartLayer', () => {
  it('keeps unchanged parts and only rebuilds the ones whose selection changed', () => {
    const parts = [part('a'), part('b'), part('c')];
    const layer = layerWith(parts);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => layer.get(id));

    layer.sync(parts, new Set(['b']), 0);
    layer.buildPending();

    expect(layer.get('a')).toBe(a);
    expect(layer.get('c')).toBe(c);
    expect(layer.get('b')).not.toBe(b);
  });

  it('moves a part in place when only its transform changed', () => {
    const before = part('a');
    const layer = layerWith([before]);
    const group = layer.get('a');
    const moved = { ...before, position: [5, 6, 7] as [number, number, number] };

    expect(onlyTransformChanged(before, moved)).toBe(true);

    layer.sync([moved], new Set(), 0);

    expect(layer.get('a')).toBe(group);
    expect(group?.position.toArray()).toEqual([5, 6, 7]);
  });

  it('rebuilds a part whose shape changed and drops hidden or removed parts', () => {
    const layer = layerWith([part('a'), part('b')]);
    const a = layer.get('a');

    layer.sync(
      [part('a', { dimensions: { width: 20, height: 10, depth: 10 } }), part('b', { visible: false })],
      new Set(),
      0,
    );
    layer.buildPending();

    expect(layer.get('a')).not.toBe(a);
    expect(layer.get('b')).toBeUndefined();
  });

  it('builds a large scene across several calls within its frame budget', () => {
    const many = Array.from({ length: 400 }, (_, i) => part(`p${i}`, { kind: 'sphere' }));
    const layer = new PartLayer(new THREE.Group());

    layer.sync(many, new Set(), 0);

    expect(layer.hasPending).toBe(true);

    layer.buildPending();

    expect(layer.hasPending).toBe(false);
    expect(layer.objects()).toHaveLength(400);
  });
});
