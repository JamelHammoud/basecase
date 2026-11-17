import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Marquee } from './marquee';
import type { ViewportContext } from './viewportContext';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const canvas = Object.assign(new EventTarget(), {
    setPointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 120 }),
  });
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  const root = new THREE.Group();
  const meshes = ['back', 'front', 'locked', 'hidden', 'missing'].map((id, index) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial());

    mesh.userData.partId = id;
    mesh.position.z = index;
    root.add(mesh);

    return mesh;
  });
  const selected = vi.fn();
  const parts = new Map(
    ['back', 'front', 'locked', 'hidden'].map((id) => [id, { locked: id === 'locked', visible: id !== 'hidden' }]),
  );
  const orbit = { enabled: true };
  const ctx = {
    stage: { camera, partsRoot: root, renderer: { domElement: canvas }, container: canvas, orbit },
    runtime: { draggingGizmo: false },
    props: () => ({ onMarqueeSelect: selected }),
    layer: { objects: () => meshes.map((mesh) => [mesh.userData.partId, mesh]), part: (id: string) => parts.get(id) },
  } as unknown as ViewportContext;

  camera.position.z = 20;
  camera.updateMatrixWorld();
  root.updateMatrixWorld(true);

  const marquee = new Marquee(ctx, { element: () => null, hoveringAxis: () => false });
  const cleanup = marquee.install();
  const send = (type: string, point: number) =>
    canvas.dispatchEvent(
      Object.assign(new Event(type), { clientX: point, clientY: point, button: 0, shiftKey: true, pointerId: 1 }),
    );
  const select = () => {
    send('pointerdown', 30);
    send('pointermove', 90);
    send('pointerup', 90);
  };

  return { select, selected, cleanup, parts, meshes, orbit };
}

describe('marquee ray grid', () => {
  it('reuses probe storage while retaining every selectable surface in hit order', () => {
    const app = fixture();
    const rays = vi.spyOn(THREE.Raycaster.prototype, 'setFromCamera');
    const intersections = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects');

    app.select();

    expect(app.selected).toHaveBeenLastCalledWith(['front', 'back']);
    expect(rays).toHaveBeenCalledTimes(49);
    expect(new Set(rays.mock.calls.map(([ndc]) => ndc)).size).toBe(1);
    expect(intersections).toHaveBeenCalledTimes(49);
    expect(new Set(intersections.mock.calls.map((call) => call[2])).size).toBe(1);
    expect(intersections.mock.calls[0][2]).toHaveLength(5);
    expect(app.orbit.enabled).toBe(true);
    app.cleanup();
  });

  it('clears earlier hits and reads edited geometry and selection flags on another drag', () => {
    const app = fixture();

    app.select();
    app.meshes[1].position.x = 50;
    app.meshes[1].updateMatrixWorld();
    app.parts.set('back', { locked: true, visible: true });
    app.parts.set('locked', { locked: false, visible: true });
    app.select();

    expect(app.selected).toHaveBeenLastCalledWith(['locked']);

    app.meshes[2].position.x = 50;
    app.meshes[2].updateMatrixWorld();
    app.select();

    expect(app.selected).toHaveBeenLastCalledWith([]);
    app.cleanup();
  });
});
