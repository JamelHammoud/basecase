import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkLabel, topCenterOnScreen } from './markLabel';

function previousAnchor(points: THREE.Vector3[], camera: THREE.Camera) {
  const projected = new THREE.Vector3();
  const top = new THREE.Vector3(0, -Infinity, 0);
  let left = Infinity;
  let right = -Infinity;

  for (const point of points) {
    projected.copy(point).project(camera);

    if (projected.z > 1) continue;

    left = Math.min(left, projected.x);
    right = Math.max(right, projected.x);

    if (projected.y > top.y) top.copy(projected);
  }

  if (!Number.isFinite(top.y)) return points[0].clone();

  return new THREE.Vector3((left + right) / 2, top.y, top.z).unproject(camera);
}

function cameraAt(x: number) {
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 1, 5000);

  camera.position.set(x, 20, 500);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  return camera;
}

afterEach(() => vi.unstubAllGlobals());

it('preserves exact label anchors through clipping, ties, movement and nonfinite points', () => {
  const out = new THREE.Vector3();
  const strokes = [
    [new THREE.Vector3(-50, 100, 0), new THREE.Vector3(50, 100, 0), new THREE.Vector3(20, -20, 30)],
    [new THREE.Vector3(0, 0, 501), new THREE.Vector3(0, 0, 600)],
    [new THREE.Vector3(1, 2, 3)],
    [new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(0, 20, 0)],
    [new THREE.Vector3(Infinity, 0, 0)],
  ];

  for (const camera of [cameraAt(0), cameraAt(200)]) {
    for (const points of strokes) {
      const saved = points.map((point) => point.clone());
      const expected = previousAnchor(points, camera);

      expect(topCenterOnScreen(points, camera, out)).toBe(out);
      expect(out).toEqual(expected);
      expect(points).toEqual(saved);
    }
  }
});

function canvasDocument() {
  const context = {
    measureText: () => ({ width: 120 }),
    beginPath: () => {},
    roundRect: () => {},
    fill: () => {},
    fillText: () => {},
  };

  return { createElement: () => ({ getContext: () => context }) };
}

it('reuses independent label projection storage across redraws and viewport changes', () => {
  vi.stubGlobal('document', canvasDocument());

  const points = [new THREE.Vector3(-50, 100, 0), new THREE.Vector3(50, 100, 0)];
  const saved = points.map((point) => point.clone());
  const labels = [new MarkLabel('Arm', '#ffffff', points), new MarkLabel('Base', '#ffffff', points)];
  const camera = cameraAt(0);
  const sizeTargets: THREE.Vector2[] = [];
  const projectionTargets: THREE.Vector3[] = [];
  const screenTargets: THREE.Vector3[] = [];
  const project = THREE.Vector3.prototype.project;
  const spy = vi.spyOn(THREE.Vector3.prototype, 'project').mockImplementation(function (this: THREE.Vector3, camera) {
    projectionTargets.push(this);

    return project.call(this, camera);
  });
  let width = 800;
  let height = 600;
  const renderer = {
    getSize: (target: THREE.Vector2) => {
      sizeTargets.push(target);

      return target.set(width, height);
    },
  } as unknown as THREE.WebGLRenderer;

  try {
    for (let frame = 0; frame < 3; frame++) {
      width += 200;
      height += 100;
      points[0].x += 10;
      camera.position.x += 20;
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      for (const label of labels) {
        const anchor = previousAnchor(points, camera);
        const screen = anchor.clone().project(camera);

        projectionTargets.length = 0;
        label.sprite.onBeforeRender(
          renderer,
          new THREE.Scene(),
          camera,
          label.sprite.geometry,
          label.sprite.material,
          new THREE.Group(),
        );
        screenTargets.push(projectionTargets.at(-1)!);
        expect(label.sprite.position).toEqual(anchor);
        expect(label.hitRect()).toEqual({
          x: ((screen.x + 1) / 2) * width - label.widthPx / 2,
          y: ((1 - screen.y) / 2) * height - 8 - 24,
          width: label.widthPx,
          height: 24,
        });
        expect(projectionTargets.slice(0, points.length).every((target) => target === label.sprite.position)).toBe(
          true,
        );
      }
    }

    expect(sizeTargets[0]).not.toBe(sizeTargets[1]);
    expect(screenTargets[0]).not.toBe(screenTargets[1]);

    for (let i = 0; i < sizeTargets.length; i++) {
      expect(sizeTargets[i]).toBe(sizeTargets[i % 2]);
      expect(screenTargets[i]).toBe(screenTargets[i % 2]);
    }

    expect(points[1]).toEqual(saved[1]);
  } finally {
    spy.mockRestore();
    labels.forEach((label) => label.dispose());
  }
});
