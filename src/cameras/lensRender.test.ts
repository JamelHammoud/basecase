import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { LensRenderer } from './lensRender';

const state = vi.hoisted(() => ({ software: true }));

vi.mock('../three/softwareGl', () => ({ softwareGl: () => state.software }));

afterEach(() => {
  state.software = true;
});

it('renders a software camera without awaiting unused shader precompilation', async () => {
  const compileAsync = vi.fn(() => new Promise(() => {}));
  const renderer = {
    compileAsync,
    getSize: (size: THREE.Vector2) => size.set(640, 480),
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    render: vi.fn(),
  };
  const lens = new LensRenderer(renderer as unknown as THREE.WebGLRenderer);
  const scene = new THREE.Scene();

  await lens.warm(scene);
  lens.render(scene, {
    position: [100, 200, 300],
    target: [0, 0, 0],
    up: [0, 1, 0],
    lens: { model: 'pinhole', hfovDeg: 70 },
  });
  expect(compileAsync).not.toHaveBeenCalled();
  expect(renderer.render).toHaveBeenCalledExactlyOnceWith(scene, lens.camera);
  expect(lens.camera.aspect).toBeCloseTo(4 / 3);
  expect(lens.camera.position.toArray()).toEqual([100, 200, 300]);
  lens.dispose();
});

it('warms scene and fisheye shaders on a hardware renderer before resolving', async () => {
  state.software = false;

  const ready: Array<() => void> = [];
  const compileAsync = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        ready.push(resolve);
      }),
  );
  const lens = new LensRenderer({ compileAsync } as unknown as THREE.WebGLRenderer);
  const scene = new THREE.Scene();
  const completed = vi.fn();
  const warmed = lens.warm(scene).then(completed);

  expect(compileAsync).toHaveBeenCalledTimes(2);
  expect(compileAsync.mock.calls[0]).toEqual([scene, lens.camera]);
  ready[0]();
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  ready[1]();
  await warmed;
  expect(completed).toHaveBeenCalledOnce();
  lens.dispose();
});
