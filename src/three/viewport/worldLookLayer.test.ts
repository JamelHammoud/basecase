import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { PartLayer } from './partLayer';
import { shownLook, WorldLookLayer } from './worldLookLayer';

const part = (id: string, color: string): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color,
  note: '',
  visible: true,
  locked: false,
});

const colorsOf = (group: THREE.Object3D) => {
  const found: string[] = [];

  group.traverse((object) => {
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

    if (mesh.isMesh) found.push(`#${mesh.material.color.getHexString()}`);
  });

  return found;
};

const worldWith = (parts: ScenePart[]) => {
  const layer = new PartLayer(new THREE.Group());

  layer.sync(parts, new Set(), 0);
  layer.buildPending();

  return { layer, looks: new WorldLookLayer(layer) };
};

describe('shownLook', () => {
  it('shows the part as it is without a look or when the look keeps its colour', () => {
    expect(shownLook(part('a', '#888888'), undefined)).toEqual({ visible: true, color: null });
    expect(shownLook(part('a', '#AABBCC'), { visible: true, color: '#aabbcc' })).toEqual({
      visible: true,
      color: null,
    });
  });

  it('hides and recolours from the look', () => {
    expect(shownLook(part('a', '#888888'), { visible: false, color: '#ff0000' })).toEqual({
      visible: false,
      color: '#ff0000',
    });
  });
});

describe('WorldLookLayer', () => {
  it('recolours and hides the existing meshes, then restores them when the id leaves the map', () => {
    const { layer, looks } = worldWith([part('a', '#888888'), part('b', '#123456')]);
    const a = layer.get('a')!;
    const own = colorsOf(a);
    const bOwn = colorsOf(layer.get('b')!);

    looks.set({ a: { visible: false, color: '#ff0000' }, b: { visible: true, color: '#123456' } });

    expect(layer.get('a')).toBe(a);
    expect(own.length).toBeGreaterThan(0);
    expect(a.visible).toBe(false);
    expect(colorsOf(a).every((c) => c === '#ff0000')).toBe(true);
    expect(colorsOf(layer.get('b')!)).toEqual(bOwn);

    looks.set({ b: { visible: true, color: '#123456' } });

    expect(a.visible).toBe(true);
    expect(colorsOf(a)).toEqual(own);
  });

  it('restores every part when cleared', () => {
    const { layer, looks } = worldWith([part('a', '#888888')]);
    const a = layer.get('a')!;
    const own = colorsOf(a);

    looks.set({ a: { visible: false, color: '#00ff00' } });
    looks.set(null);

    expect(a.visible).toBe(true);
    expect(colorsOf(a)).toEqual(own);
  });
});
