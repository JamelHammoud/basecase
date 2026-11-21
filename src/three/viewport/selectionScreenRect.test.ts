import { describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, Vector2, Vector3, Vector4 } from 'three';
import { SelectionScreenRect } from './selectionScreenRect';

function reference(groups: Group[], camera: PerspectiveCamera, pad: Vector2) {
  const box = new Box3();

  groups.forEach((group) => box.expandByObject(group));

  if (box.isEmpty()) return null;

  const points = Array.from({ length: 8 }, (_, i) =>
    new Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).applyMatrix4(camera.matrixWorldInverse),
  );

  if (points.some((point) => point.z > -camera.near)) return new Vector4(-1, -1, 1, 1);

  points.forEach((point) => point.applyMatrix4(camera.projectionMatrix));

  const rect = new Vector4(
    Math.max(-1, Math.min(...points.map((p) => p.x)) - pad.x),
    Math.max(-1, Math.min(...points.map((p) => p.y)) - pad.y),
    Math.min(1, Math.max(...points.map((p) => p.x)) + pad.x),
    Math.min(1, Math.max(...points.map((p) => p.y)) + pad.y),
  );

  return rect.x < rect.z && rect.y < rect.w ? rect : null;
}

function fixture() {
  const camera = new PerspectiveCamera(55, 1.6, 1, 1000);
  const group = new Group();
  const mesh = new Mesh(new BoxGeometry(2, 3, 4));

  group.add(mesh);
  group.position.z = -12;
  camera.updateMatrixWorld();

  return { camera, group, mesh };
}

describe('selection screen rectangle', () => {
  it('matches projected bounds through group, camera and viewport edits', () => {
    const { camera, group, mesh } = fixture();
    const other = new Group();
    const bounds = new SelectionScreenRect();

    other.add(new Mesh(mesh.geometry));
    other.position.set(3, -2, -16);

    for (let i = 0; i < 40; i++) {
      group.rotation.set(i * 0.1, i * 0.07, i * 0.03);
      group.scale.set(1 + i * 0.02, 0.5, 2);
      camera.position.set(Math.sin(i), Math.cos(i), i * 0.1);
      camera.lookAt(0, 0, -12);
      camera.aspect = 0.7 + i * 0.06;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      const pad = new Vector2(0.003 + i * 0.001, 0.009);
      const groups = i % 2 ? [group] : [group, other];

      expect(bounds.update(groups, camera, pad)).toEqual(reference(groups, camera, pad));
    }
  });

  it('resets after empty, offscreen, near-plane and behind-camera selections', () => {
    const { camera, group } = fixture();
    const bounds = new SelectionScreenRect();
    const pad = new Vector2(0.01, 0.02);
    const first = bounds.update([group], camera, pad)?.clone();

    expect(bounds.update([], camera, pad)).toBeNull();
    expect(bounds.update([new Group()], camera, pad)).toBeNull();
    group.position.x = 100;
    expect(bounds.update([group], camera, pad)).toBeNull();
    group.position.set(0, 0, -2.5);
    expect(bounds.update([group], camera, pad)).toEqual(new Vector4(-1, -1, 1, 1));
    group.position.z = 5;
    expect(bounds.update([group], camera, pad)).toEqual(new Vector4(-1, -1, 1, 1));
    group.position.z = -12;
    expect(bounds.update([group], camera, pad)).toEqual(first);
  });

  it('reuses the projection vector and result across frames without sharing between outlines', () => {
    const { camera, group, mesh } = fixture();
    const bounds = new SelectionScreenRect();
    const pad = new Vector2(0.01, 0.02);

    mesh.geometry.computeBoundingBox();

    const projection = vi.spyOn(Vector3.prototype, 'applyMatrix4');

    try {
      const first = bounds.update([group], camera, pad);
      const second = bounds.update([group], camera, pad);
      const projected = projection.mock.contexts.filter(
        (_, i) => projection.mock.calls[i][0] === camera.projectionMatrix,
      );

      expect(second).toBe(first);
      expect(projected).toHaveLength(16);
      expect(new Set(projected).size).toBe(1);
      expect(new SelectionScreenRect().update([group], camera, pad)).not.toBe(first);
    } finally {
      projection.mockRestore();
    }
  });
});
