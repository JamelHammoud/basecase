import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { PlatePointer } from './platePointer';

function fixture() {
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
  const rect = { left: 40, top: 70, width: 800, height: 600 };
  const canvas = { getBoundingClientRect: () => ({ ...rect }) as DOMRect };

  return { camera, rect, pointer: new PlatePointer(canvas, camera) };
}

function previousRay(view: ReturnType<typeof fixture>, x: number, y: number) {
  const { rect, camera } = view;
  const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();

  raycaster.setFromCamera(ndc, camera);

  return raycaster;
}

it.each([300, 600])('retains independent pointer workspaces across %i changing queries', (count) => {
  const views = [fixture(), fixture()];
  const rays = views.map(({ pointer }) => pointer.ray(100, 150));
  const retainedPoints: THREE.Vector3[] = [];
  const snapshots: number[][] = [];
  const bed = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(400, 20, 400), new THREE.MeshBasicMaterial());

  mesh.updateMatrixWorld(true);

  for (let frame = 0; frame < count; frame++) {
    for (const [index, view] of views.entries()) {
      const { camera, rect, pointer } = view;

      rect.left = 40 + frame / 3;
      rect.top = 70 - frame / 7;
      rect.width = 800 + frame;
      rect.height = 600 + index * 100;
      camera.aspect = rect.width / rect.height;
      camera.zoom = 1 + (frame % 5) / 10;
      camera.position.set(frame / 7, 300 + index * 70, 400 - frame / 9);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      const x = rect.left + rect.width * (0.3 + (frame % 7) / 20);
      const y = rect.top + rect.height * (0.3 + (frame % 11) / 30);
      const previous = previousRay(view, x, y);
      const actual = pointer.ray(x, y);

      expect(actual).toBe(rays[index]);
      expect(actual.ray).toEqual(previous.ray);
      expect(actual.intersectObject(mesh)).toEqual(previous.intersectObject(mesh));

      const point = pointer.bedPoint(x, y);

      expect(point).toEqual(previous.ray.intersectPlane(bed, new THREE.Vector3()));

      if (!point) continue;

      retainedPoints.push(point);
      snapshots.push(point.toArray());
    }
  }

  expect(rays[0]).not.toBe(rays[1]);
  expect(new Set(retainedPoints).size).toBe(retainedPoints.length);
  expect(retainedPoints.map((point) => point.toArray())).toEqual(snapshots);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

it('reuses coordinate and plane storage through bed hits, misses and parallel rays', () => {
  const view = fixture();
  const { pointer, camera, rect } = view;

  camera.position.set(0, 100, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const expected = previousRay(view, rect.left + 400, rect.top + 300).ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Vector3(),
  );
  const project = vi.spyOn(THREE.Raycaster.prototype, 'setFromCamera');
  const intersect = vi.spyOn(THREE.Ray.prototype, 'intersectPlane');

  try {
    expect(expected).not.toBeNull();
    expect(pointer.bedPoint(rect.left + 400, rect.top + 300)).toEqual(expected);
    camera.lookAt(0, 200, 0);
    camera.updateMatrixWorld(true);
    expect(pointer.bedPoint(rect.left + 400, rect.top + 300)).toBeNull();
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 100, -100);
    camera.updateMatrixWorld(true);
    expect(pointer.bedPoint(rect.left + 400, rect.top + 300)).toBeNull();
    expect(new Set(project.mock.calls.map(([ndc]) => ndc)).size).toBe(1);
    expect(new Set(project.mock.contexts).size).toBe(1);
    expect(new Set(intersect.mock.calls.map(([plane]) => plane)).size).toBe(1);
  } finally {
    project.mockRestore();
    intersect.mockRestore();
  }
});
