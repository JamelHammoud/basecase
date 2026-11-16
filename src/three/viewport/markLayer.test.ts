import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SceneMark } from '../../types/robotics';
import { MarkLayer } from './markLayer';

const SIZE = { width: 800, height: 600 };

const mark = (id: string, y: number): SceneMark => ({
  id,
  points: [
    [-50, y, 0],
    [50, y, 0],
  ],
  partIds: [],
  color: '#ef4444',
  view: 'az:0,el:0',
  createdAt: '2026-01-01T00:00:00.000Z',
});

function setup() {
  const scene = new THREE.Scene();
  const overlays = new THREE.Group();
  const layer = new MarkLayer(scene, overlays);
  const camera = new THREE.PerspectiveCamera(50, SIZE.width / SIZE.height, 1, 5000);

  camera.position.set(0, 0, 500);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  layer.sync([mark('top', 100), mark('bottom', -100)]);

  return { layer, camera };
}

const pixelOf = (point: THREE.Vector3, camera: THREE.Camera): [number, number] => {
  const p = point.clone().project(camera);

  return [((p.x + 1) / 2) * SIZE.width, ((1 - p.y) / 2) * SIZE.height];
};

describe('MarkLayer', () => {
  it('finds only the marks under the pointer', () => {
    const { layer, camera } = setup();
    const onTop = pixelOf(new THREE.Vector3(0, 100, 0), camera);
    const between = pixelOf(new THREE.Vector3(0, 0, 0), camera);

    expect(layer.hits(onTop, camera, SIZE)).toEqual(['top']);
    expect(layer.hits(between, camera, SIZE)).toEqual([]);
  });

  it('shares streamed picking across selection and erasing, including ties and the reach boundary', () => {
    const { layer, camera } = setup();

    layer.sync([mark('first', 0), mark('tie', 0)]);

    const center = pixelOf(new THREE.Vector3(), camera);
    const edge: [number, number] = [center[0], center[1] + 10];
    const outside: [number, number] = [center[0], center[1] + 10.001];
    const source = layer.pointsOf('first')!;
    const mapped = vi.spyOn(source, 'map');

    try {
      expect(layer.hitTest(edge, camera, SIZE)).toBe('first');
      expect(layer.hits(edge, camera, SIZE)).toEqual(['first', 'tie']);
      expect(layer.hitTest(outside, camera, SIZE)).toBeNull();
      expect(layer.hits(outside, camera, SIZE)).toEqual([]);
      expect(mapped).not.toHaveBeenCalled();
    } finally {
      mapped.mockRestore();
      layer.dispose();
    }
  });

  it('reads the current stroke, camera and viewport on each query', () => {
    const { layer, camera } = setup();

    layer.shift('top', new THREE.Vector3(50, -30, 0));
    camera.position.set(200, 100, 500);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const size = { width: 1600, height: 1200 };
    const center = pixelOf(layer.centerOf('top')!, camera);
    const pixel: [number, number] = [center[0] * 2, center[1] * 2];

    expect(layer.hitTest(pixel, camera, size)).toBe('top');
    expect(layer.hits(pixel, camera, size)).toEqual(['top']);
    layer.dispose();
  });

  it('fades the marks being erased and restores the rest', () => {
    const { layer } = setup();
    const lines = layer.group.children as Array<THREE.Mesh<THREE.BufferGeometry, THREE.Material>>;

    layer.fade(new Set(['top']));
    expect(lines.map((l) => l.material.opacity)).toEqual([0.2, 1]);

    layer.fade(new Set());
    expect(lines.map((l) => l.material.opacity)).toEqual([1, 1]);
  });

  it('anchors the label at the top centre of the mark on screen', () => {
    const { layer, camera } = setup();
    const top = layer.topOf('top', camera)!;

    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(100);
    expect(layer.topOf('missing', camera)).toBeNull();
  });

  it('moves a mark while dragging and puts it back when cancelled', () => {
    const { layer } = setup();

    layer.shift('top', new THREE.Vector3(10, -20, 0));
    expect(layer.centerOf('top')!.toArray()).toEqual([10, 80, 0]);

    layer.shift('top', new THREE.Vector3());
    expect(layer.pointsOf('top')!.map((p) => p.toArray())).toEqual([
      [-50, 100, 0],
      [50, 100, 0],
    ]);
  });
});
