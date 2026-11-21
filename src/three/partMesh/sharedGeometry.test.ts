import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

const BUDGET = 3_000_000;
const positions = new Float32Array((BUDGET + 1) * 3);

function geometry(vertices: number) {
  const value = new THREE.BufferGeometry();

  value.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, vertices * 3), 3));

  return value;
}

async function freshCache() {
  vi.resetModules();

  return import('./sharedGeometry');
}

describe('shared geometry retention', () => {
  it.each(['offered', 'released'])('keeps reusable meshes when an oversized mesh is %s', async (source) => {
    const cache = await freshCache();
    const dispose = vi.fn((value: THREE.BufferGeometry) => value.dispose());
    const build = vi.fn(() => geometry(24));
    const resident = cache.acquireShared('resident', build, dispose);

    cache.releaseShared('resident');

    const oversized = geometry(BUDGET + 1);

    if (source === 'offered') cache.offerShared('oversized', oversized, dispose);
    else {
      expect(cache.acquireShared('oversized', () => oversized, dispose)).toBe(oversized);
      expect(cache.acquireShared('oversized', () => oversized, dispose)).toBe(oversized);
      cache.releaseShared('oversized');
      expect(dispose).not.toHaveBeenCalled();
      cache.releaseShared('oversized');
    }

    expect(dispose.mock.calls.map(([value]) => value)).toEqual([oversized]);
    expect(cache.hasShared('oversized')).toBe(false);
    expect(cache.sharedEntryCount()).toBe(0);
    expect(cache.acquireShared('resident', build, dispose)).toBe(resident);
    expect(build).toHaveBeenCalledTimes(1);
    cache.releaseShared('resident');
  });

  it('rejects oversized piece collections without evicting retained edges', async () => {
    const cache = await freshCache();
    const resident = geometry(12);
    const disposeResident = vi.fn();
    const pieces = [{ geometry: geometry(BUDGET / 2) }, { geometry: geometry(BUDGET / 2 + 1) }];
    const disposePieces = vi.fn();

    cache.offerShared('edges', resident, disposeResident);
    cache.offerShared('pieces', pieces, disposePieces);
    expect(disposePieces).toHaveBeenCalledExactlyOnceWith(pieces);
    expect(disposeResident).not.toHaveBeenCalled();
    expect(cache.hasShared('edges')).toBe(true);
    expect(cache.hasShared('pieces')).toBe(false);
  });

  it('retains the inclusive budget and evicts in release order when fitting entries overflow it', async () => {
    const cache = await freshCache();
    const dispose = vi.fn();
    const full = geometry(BUDGET);
    const first = geometry(1);
    const second = geometry(2);

    cache.offerShared('full', full, dispose);
    expect(cache.hasShared('full')).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    expect(cache.acquireShared('full', () => full, dispose)).toBe(full);
    cache.releaseShared('full');
    cache.offerShared('first', first, dispose);
    expect(dispose).toHaveBeenCalledExactlyOnceWith(full);
    cache.offerShared('second', second, dispose);
    cache.offerShared('full-again', full, dispose);
    expect(dispose.mock.calls.map(([value]) => value)).toEqual([full, first, second]);
    expect(cache.hasShared('full-again')).toBe(true);
  });
});
