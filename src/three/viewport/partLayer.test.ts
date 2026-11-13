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
    const many = Array.from({ length: 40 }, (_, i) => part(`p${i}`, { kind: 'sphere' }));
    const layer = new PartLayer(new THREE.Group());

    layer.sync(many, new Set(), 0);

    expect(layer.hasPending).toBe(true);

    layer.buildPending();

    expect(layer.hasPending).toBe(false);
    expect(layer.objects()).toHaveLength(40);
  });

  it('maps a point picked on a posed part back to the same spot at rest', () => {
    const layer = layerWith([part('arm', { position: [20, 0, 0] })]);
    const group = layer.get('arm')!;
    const onSurface = new THREE.Vector3(5, 2, -3);

    group.updateMatrixWorld(true);

    const atRest = onSurface.clone().applyMatrix4(group.matrixWorld);

    layer.pose = new Map([['arm', new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(40))]]);
    layer.applyPose();

    const picked = onSurface.clone().applyMatrix4(group.matrixWorld);

    expect(picked.distanceTo(atRest)).toBeGreaterThan(5);
    expect(
      new THREE.Vector3(...layer.pointAtRest('arm', [picked.x, picked.y, picked.z])).distanceTo(atRest),
    ).toBeLessThan(1e-9);
    expect(layer.pointAtRest('other', [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('measures under a given pose, then puts the live pose back', () => {
    const layer = layerWith([part('arm', { position: [20, 0, 0] })]);
    const group = layer.get('arm')!;
    const live = new Map([['arm', new THREE.Matrix4().makeTranslation(0, -30, 0)]]);
    const canvas = new Map([['arm', new THREE.Matrix4().makeTranslation(0, 10, 0)]]);
    const height = () => {
      group.updateMatrixWorld(true);

      return new THREE.Vector3().setFromMatrixPosition(group.matrixWorld).y;
    };
    const reapply = () => layer.applyPose();

    layer.pose = live;
    reapply();

    expect(layer.withPose(canvas, height, reapply)).toBeCloseTo(10);
    expect(layer.withRest(height, reapply)).toBeCloseTo(0);
    expect(layer.pose).toBe(live);
    expect(height()).toBeCloseTo(-30);
  });
});
