import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { findInterferences } from './interference';

const box = (id: string, x: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20));

  mesh.position.set(x, 0, 0);

  return { id, object: mesh };
};

describe('findInterferences', () => {
  it('reports the depth of two overlapping boxes', () => {
    const { interferences } = findInterferences([box('a', 0), box('b', 15)]);

    expect(interferences).toEqual([{ a: 'a', b: 'b', depthMm: 5, fraction: 0.04 }]);
  });

  it('reports nothing for two touching boxes', () => {
    const { interferences } = findInterferences([box('a', 0), box('b', 20)]);

    expect(interferences).toEqual([]);
  });

  it('ignores pairs away from the focused parts', () => {
    const { interferences } = findInterferences([box('a', 0), box('b', 15), box('c', 200)], 0.3, 400, ['c']);

    expect(interferences).toEqual([]);
  });
});
