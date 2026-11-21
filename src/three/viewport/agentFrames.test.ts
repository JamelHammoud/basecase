import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { AgentFrames } from './agentFrames';
import type { AgentFrame } from './types';
import type { ViewportContext } from './viewportContext';

const corners = [false, true].flatMap((x) => [false, true].flatMap((y) => [false, true].map((z) => [x, y, z])));

function previousSegments(box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.22);
  const brackets = corners.flatMap(([hx, hy, hz]) => {
    const x = hx ? box.max.x : box.min.x;
    const y = hy ? box.max.y : box.min.y;
    const z = hz ? box.max.z : box.min.z;
    const dx = hx ? -size.x : size.x;
    const dy = hy ? -size.y : size.y;
    const dz = hz ? -size.z : size.z;

    return [x, y, z, x + dx, y, z, x, y, z, x, y + dy, z, x, y, z, x, y, z + dz];
  });
  const edges = corners.flatMap(([hx, hy, hz]) => {
    const from = [hx ? box.max.x : box.min.x, hy ? box.max.y : box.min.y, hz ? box.max.z : box.min.z];
    const ends: number[][] = [];

    if (!hx) ends.push([box.max.x, from[1], from[2]]);

    if (!hy) ends.push([from[0], box.max.y, from[2]]);

    if (!hz) ends.push([from[0], from[1], box.max.z]);

    return ends.flatMap((end) => [...from, ...end]);
  });

  return [brackets, edges];
}

function setup() {
  const overlays = new THREE.Group();
  const object = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial());
  const objects = new Map([['part', object]]);
  const ctx = { stage: { overlays }, layer: { get: (id: string) => objects.get(id) } } as unknown as ViewportContext;
  const frames = new AgentFrames(ctx);

  return { overlays, object, objects, frames };
}

const frame = (emphasis: AgentFrame['emphasis']): AgentFrame => ({
  key: 'worker',
  color: '#ffffff',
  partIds: ['part', 'missing'],
  emphasis,
});

describe('agent frame segment preparation', () => {
  it('preserves complete bracket and outline coordinates across poses and emphasis changes', () => {
    const { frames, object } = setup();
    const positions = vi.spyOn(LineSegmentsGeometry.prototype, 'setPositions');

    try {
      for (let i = 0; i < 60; i++) {
        object.position.set(i - 30, -i * 2, i / 3);
        object.rotation.set(i / 10, -i / 7, i / 5);
        object.scale.set(i % 4, (i + 1) / 10, i % 2 ? -2 : 3);
        object.updateMatrixWorld(true);
        frames.sync([frame('focus')]);
        frames.refresh();

        const bounds = new THREE.Box3().expandByObject(object);
        const size = bounds.getSize(new THREE.Vector3());
        const padded = bounds.expandByScalar(Math.max(2, Math.max(size.x, size.y, size.z) * 0.04));
        const calls = positions.mock.calls.slice(-2).map(([values]) => Array.from(values));

        expect(calls).toEqual(previousSegments(padded));
        positions.mockClear();
        expect(frames.refresh()).toBe(false);
        expect(positions).not.toHaveBeenCalled();
      }

      for (const emphasis of ['normal', 'dim'] as const) {
        frames.sync([frame(emphasis)]);
        expect(positions).toHaveBeenCalledTimes(1);
        positions.mockClear();
      }
    } finally {
      positions.mockRestore();
      frames.dispose();
      object.geometry.dispose();
      object.material.dispose();
    }
  });

  it('hides missing targets, restores changed targets and releases overlays', () => {
    const { frames, overlays, object, objects } = setup();

    frames.sync([frame('focus')]);
    objects.clear();
    expect(frames.refresh()).toBe(true);
    expect(overlays.getObjectByName('agent-frames')?.children.every((line) => !line.visible)).toBe(true);
    expect(frames.refresh()).toBe(false);
    objects.set('part', object);
    expect(frames.refresh()).toBe(true);
    expect(overlays.getObjectByName('agent-frames')?.children.every((line) => line.visible)).toBe(true);
    frames.dispose();
    expect(overlays.children).toHaveLength(0);
    object.geometry.dispose();
    object.material.dispose();
  });
});
