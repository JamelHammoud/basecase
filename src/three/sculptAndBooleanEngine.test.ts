import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SculptSettings } from '../types/robotics';
import { applyDeformersToBufferGeometry, sculptStroke, tessellateGeometryForSculpting } from './sculptAndBooleanEngine';

const box = () => tessellateGeometryForSculpting(new THREE.BoxGeometry(20, 30, 10, 4, 4, 4), 1);
const positions = (g: THREE.BufferGeometry) => Array.from(g.getAttribute('position').array as Float32Array);
const widthAt = (g: THREE.BufferGeometry, y: number) => {
  const pos = g.getAttribute('position');
  let max = 0;

  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - y) < 1e-3) max = Math.max(max, Math.abs(pos.getX(i)));
  }

  return max;
};

const settings = (over: Partial<SculptSettings>): SculptSettings => ({
  brush: 'inflate',
  radiusMm: 8,
  strength: 0.6,
  symmetryX: false,
  symmetryZ: false,
  ...over,
});

const hit = new THREE.Vector3(6, 4, 5);
const normal = new THREE.Vector3(0, 0, 1);
const drag = new THREE.Vector3(1, 2, 0);

describe('applyDeformersToBufferGeometry', () => {
  it('tapers the top narrower than the bottom', () => {
    const g = box();

    applyDeformersToBufferGeometry(g, { taper: -0.5 });

    expect(widthAt(g, -15)).toBeCloseTo(10);
    expect(widthAt(g, 15)).toBeCloseTo(5);
  });

  it('leaves the geometry alone below the thresholds', () => {
    const g = box();

    applyDeformersToBufferGeometry(g, { taper: 0.0005, twistDeg: 0.05, bendDeg: 0.05, roundness: 0.0005 });

    expect(positions(g)).toEqual(positions(box()));
  });
});

describe('sculptStroke', () => {
  it('carves with an inverted inflate brush', () => {
    const inverted = box();
    const carved = box();

    sculptStroke({
      geo: inverted,
      localHitPoint: hit,
      localHitNormal: normal,
      dragDeltaLocal: drag,
      settings: settings({ brush: 'inflate' }),
      invertBrush: true,
    });
    sculptStroke({
      geo: carved,
      localHitPoint: hit,
      localHitNormal: normal,
      dragDeltaLocal: drag,
      settings: settings({ brush: 'carve' }),
    });

    expect(positions(inverted)).toEqual(positions(carved));
    expect(positions(carved)).not.toEqual(positions(box()));
  });

  it('mirrors the stroke across X', () => {
    const before = box().getAttribute('position');
    const g = box();

    sculptStroke({
      geo: g,
      localHitPoint: hit,
      localHitNormal: normal,
      dragDeltaLocal: new THREE.Vector3(0, 2, 0),
      settings: settings({ brush: 'grab', symmetryX: true }),
    });

    const after = g.getAttribute('position');
    const key = (x: number, y: number, z: number) => [x, y, z].map((c) => c.toFixed(3)).join(',');
    const moved = new Map<string, number>();

    for (let i = 0; i < before.count; i++) {
      moved.set(key(before.getX(i), before.getY(i), before.getZ(i)), after.getY(i) - before.getY(i));
    }

    const left = moved.get(key(5, 3.75, 5)) ?? 0;

    expect(left).toBeGreaterThan(0);
    expect(moved.get(key(-5, 3.75, 5))).toBeCloseTo(left);
  });
});
