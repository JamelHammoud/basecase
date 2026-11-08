import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { place, type Placed } from '../three/analysis/collide';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import type { FastenerChain } from './assemblyTypes';
import { driverOptions } from './driverAccess';

function slab(id: string, y0: number, y1: number): Placed {
  const geometry = new THREE.BoxGeometry(300, y1 - y0, 300).toNonIndexed();

  geometry.translate(0, (y0 + y1) / 2, 0);

  return place(id, solidFromPositions(geometry.attributes.position.array as Float32Array), new THREE.Matrix4());
}

const chain = {
  id: 'screw',
  d: 3,
  axis: [0, 1, 0],
  tip: [0, -8, 0],
  top: [0, 0, 0],
  headR: 3,
  stack: [],
  endsIn: { kind: 'printed' },
  engagementMm: 8,
  needMm: 4,
  problems: [],
} as FastenerChain;

const straightBlockers = (...parts: Placed[]) => driverOptions(chain, parts, new Set())[0].blockers;

describe('a straight driver', () => {
  it.each([
    ['a 2 mm lid between old sample points', 40.2, 42.2],
    ['a 0.9 mm wall between old sample points', 10.05, 10.95],
    ['a lid at the far end of the handle', 90, 91],
  ])('is stopped by %s', (_name, y0, y1) => {
    expect(straightBlockers(slab('lid', y0, y1))).toEqual(['lid']);
  });

  it('passes when the slab is past the driver’s reach', () => {
    expect(straightBlockers(slab('lid', 95, 97))).toEqual([]);
  });

  it('passes when the only slab is under the head', () => {
    expect(straightBlockers(slab('plate', -10, 0))).toEqual([]);
  });
});

describe('an L-key', () => {
  it('its arm is stopped by a thin wall between old sample radii', () => {
    const wall = new THREE.BoxGeometry(1, 40, 300).toNonIndexed();

    wall.translate(12.5, 20, 0);

    const part = place('wall', solidFromPositions(wall.attributes.position.array as Float32Array), new THREE.Matrix4());
    const keys = driverOptions(chain, [part], new Set()).filter((o) => o.tool === 'L-key');

    expect(keys.some((k) => k.blockers.includes('wall'))).toBe(true);
    expect(keys.some((k) => !k.blockers.includes('wall'))).toBe(true);
  });
});
