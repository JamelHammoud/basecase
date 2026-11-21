import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { sceneOf, component } from '../../wiring/fixtures';
import { CableRouteLayer, type CableRouteView } from './cableRouteLayer';
import type { ViewportContext } from './viewportContext';

function fixture() {
  const canvas = Object.assign(new EventTarget(), {
    clientWidth: 400,
    clientHeight: 400,
    getBoundingClientRect: () => ({ left: -100, top: -100, width: 400, height: 400 }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => true,
  });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);

  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const orbit = { enabled: true };
  const afterRender = new Set<() => void>();
  const ctx = {
    stage: {
      renderer: { domElement: canvas },
      camera,
      orbit,
      overlays: new THREE.Group(),
      container: { clientWidth: 200, clientHeight: 200, getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    },
    loop: { afterRender },
  } as unknown as ViewportContext;
  const layer = new CableRouteLayer(ctx, () => null);
  const source = sceneOf([component('owner', 'robotis-u2d2')], []);
  const view: CableRouteView = {
    key: 'route',
    source,
    anchors: [[0, 0, 0]],
    points: [[0, 0, 0]],
    endpoints: [],
    move: vi.fn(),
    cancel: vi.fn(),
  };
  const cleanup = layer.install();
  const pointer = (type: string, x = 100) => {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: 100,
    });

    canvas.dispatchEvent(event);
  };

  layer.sync(view);

  return {
    layer,
    view,
    orbit,
    afterRender,
    pointer,
    dispose: () => {
      cleanup();
      layer.dispose();
    },
  };
}

it('previews every drag movement, commits once on release and releases its overlay resources', () => {
  const f = fixture();

  f.pointer('pointerdown');
  expect(f.orbit.enabled).toBe(false);

  for (let index = 0; index < 100; index++) f.pointer('pointermove', 101 + index / 10);

  expect(f.view.move).toHaveBeenCalledTimes(100);
  expect(vi.mocked(f.view.move).mock.calls.every((call) => call[2])).toBe(true);
  f.pointer('pointerup', 111);
  expect(f.view.move).toHaveBeenCalledTimes(101);
  expect(vi.mocked(f.view.move).mock.calls.at(-1)?.[2]).toBe(false);
  expect(f.orbit.enabled).toBe(true);
  f.dispose();
  expect(f.afterRender.size).toBe(0);
});

it.each(['scene', 'geometry', 'undo', 'cancel'])(
  'discards a drag after %s without committing the pending point',
  (change) => {
    const f = fixture();

    f.pointer('pointerdown');
    f.pointer('pointermove', 110);

    if (change === 'cancel') f.pointer('pointercancel');
    else
      f.layer.sync({
        ...f.view,
        key: change === 'scene' ? 'another scene' : f.view.key,
        source: {
          ...f.view.source,
          parts: change === 'geometry' ? [...f.view.source.parts] : f.view.source.parts,
          project: change === 'undo' ? { ...f.view.source.project, wiring: [] } : f.view.source.project,
        },
      });

    f.pointer('pointerup', 110);
    expect(vi.mocked(f.view.move).mock.calls).toHaveLength(1);
    expect(vi.mocked(f.view.move).mock.calls[0][2]).toBe(true);
    expect(f.view.cancel).toHaveBeenCalledOnce();
    expect(f.orbit.enabled).toBe(true);
    f.dispose();
  },
);
