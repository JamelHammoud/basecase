import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import type { ViewportContext } from './viewportContext';
import { WorkspaceLayer } from './workspaceLayer';

it('keeps a point buffer across selections, picks displayed points and releases listeners and GPU resources', () => {
  const canvas = Object.assign(new EventTarget(), { clientWidth: 200, clientHeight: 200 });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);

  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const overlays = new THREE.Group();
  const ctx = {
    stage: {
      overlays,
      camera,
      renderer: { domElement: canvas },
      container: { clientWidth: 200, clientHeight: 200, getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    },
    loop: { redraw: vi.fn() },
  } as unknown as ViewportContext;
  const layer = new WorkspaceLayer(ctx);
  const positions = new Float64Array([0, 0, 0, 20, 10, 0]);
  const select = vi.fn();
  const uninstall = layer.install();

  layer.sync({ positions, selected: null, select });

  const cloud = overlays.children.find((child) => child instanceof THREE.Points)! as THREE.Points;
  const geometry = cloud.geometry;
  const disposed = vi.spyOn(geometry, 'dispose');
  const material = vi.spyOn(cloud.material as THREE.PointsMaterial, 'dispose');

  layer.sync({ positions, selected: 1, select });
  expect(cloud.geometry).toBe(geometry);
  expect(geometry.getAttribute('position').count).toBe(2);
  canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0, clientX: 100, clientY: 100 }));
  expect(select).toHaveBeenCalledWith(0);
  layer.sync(null);
  expect(disposed).toHaveBeenCalledOnce();
  canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0, clientX: 100, clientY: 100 }));
  expect(select).toHaveBeenCalledOnce();
  uninstall();
  layer.dispose();
  expect(material).toHaveBeenCalledOnce();
  expect(overlays.children).toHaveLength(0);
});
