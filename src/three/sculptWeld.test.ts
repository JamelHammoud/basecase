import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { describe, expect, it, vi } from 'vitest';
import { weldAndNormalizeGeometry } from './sculptEngine';

function clonedConversion(rawGeo: THREE.BufferGeometry) {
  const clean = rawGeo.clone();

  clean.deleteAttribute('uv');
  clean.deleteAttribute('normal');

  const welded = mergeVertices(clean, 1e-3);

  welded.computeBoundingBox();

  const box = welded.boundingBox!;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const posAttr = welded.getAttribute('position') as THREE.BufferAttribute;
  const positions: number[] = [];
  const sx = size.x > 1e-4 ? size.x : 1;
  const sy = size.y > 1e-4 ? size.y : 1;
  const sz = size.z > 1e-4 ? size.z : 1;

  for (let i = 0; i < posAttr.count; i++) {
    positions.push(
      Math.round(((posAttr.getX(i) - center.x) / sx) * 10000) / 10000,
      Math.round(((posAttr.getY(i) - center.y) / sy) * 10000) / 10000,
      Math.round(((posAttr.getZ(i) - center.z) / sz) * 10000) / 10000,
    );
  }

  const indexAttr = welded.getIndex();
  const indices: number[] = [];

  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i++) {
      indices.push(indexAttr.getX(i));
    }
  }

  return { positions, indices };
}

const fixtures = () => [
  new THREE.BoxGeometry(20, 30, 10, 3, 3, 3),
  new THREE.SphereGeometry(15, 16, 8),
  new THREE.CylinderGeometry(5, 10, 30, 16, 4).toNonIndexed(),
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3)),
  new THREE.PlaneGeometry(20, 30, 4, 4),
];

describe('Sculpt welding', () => {
  it('matches cloned conversion across indexed, flat, empty, and edited geometry', () => {
    for (const geometry of fixtures()) {
      expect(weldAndNormalizeGeometry(geometry)).toEqual(clonedConversion(geometry));
      geometry.translate(7, -3, 11).scale(2, 0.5, -1);
      expect(weldAndNormalizeGeometry(geometry)).toEqual(clonedConversion(geometry));
    }
  });

  it('retains custom attribute seams and reads interleaved positions without changing source buffers', () => {
    const geometry = new THREE.BufferGeometry();
    const buffer = new THREE.InterleavedBuffer(new Float32Array([0, 0, 0, 1, 2, 0, 0, 2, 0, 0, 0, 3]), 4);

    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('color', new THREE.InterleavedBufferAttribute(buffer, 1, 3));
    geometry.setIndex([0, 1, 2]);
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([1, 0, 0, 3, 0, 0, 1, 0, 0], 3)];

    const before = buffer.array.slice();
    const indices = geometry.index!.array.slice();
    const morph = geometry.morphAttributes.position[0].array.slice();
    const expected = clonedConversion(geometry);
    const first = weldAndNormalizeGeometry(geometry);

    expect(first).toEqual(expected);
    expect(first.positions).toHaveLength(9);
    expect(buffer.array).toEqual(before);
    expect(geometry.index!.array).toEqual(indices);
    expect(geometry.morphAttributes.position[0].array).toEqual(morph);
    first.positions.fill(99);
    first.indices!.fill(99);
    expect(weldAndNormalizeGeometry(geometry)).toEqual(expected);
  });

  it('avoids the preliminary clones of retained and discarded attributes', () => {
    const geometry = new THREE.BoxGeometry(20, 30, 10, 10, 10, 10);
    const position = vi.spyOn(geometry.getAttribute('position'), 'clone');
    const normal = vi.spyOn(geometry.getAttribute('normal'), 'clone');
    const uv = vi.spyOn(geometry.getAttribute('uv'), 'clone');
    const index = vi.spyOn(geometry.index!, 'clone');

    weldAndNormalizeGeometry(geometry);
    expect(position).toHaveBeenCalledTimes(1);
    expect(index).toHaveBeenCalledTimes(1);
    expect(normal).not.toHaveBeenCalled();
    expect(uv).not.toHaveBeenCalled();
    expect(geometry.getAttribute('normal')).toBeDefined();
    expect(geometry.getAttribute('uv')).toBeDefined();
  });

  it.each([false, true])('preserves normalization with morphTargetsRelative=%s', (relative) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.Float32BufferAttribute([10, 20, 30, 14, 20, 30, 10, 26, 30], 3));
    geometry.setIndex([0, 1, 2]);
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([1, 2, 3, 5, 6, 7, -1, -2, -3], 3)];
    geometry.morphTargetsRelative = relative;

    expect(weldAndNormalizeGeometry(geometry)).toEqual(clonedConversion(geometry));
    expect(geometry.morphTargetsRelative).toBe(relative);
  });
});
