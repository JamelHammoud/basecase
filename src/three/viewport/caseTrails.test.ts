import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CaseTrails } from './caseTrails';
import type { ViewportContext } from './viewportContext';

function context() {
  const overlays = new THREE.Group();
  const canvas = new EventTarget();
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 10000);

  camera.position.set(0, 0, 1000);
  camera.updateMatrixWorld();
  Object.assign(canvas, {
    clientWidth: 1000,
    clientHeight: 1000,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
  });

  return {
    props: () => ({}),
    runtime: { draggingGizmo: false },
    stage: { overlays, camera, container: canvas, renderer: { domElement: canvas } },
    loop: { redraw: vi.fn() },
  } as unknown as ViewportContext;
}

const outcome = (seed: number, passed: boolean) => ({
  seed,
  passed,
  margin: passed ? 1 : -1,
  failed: [],
  firstTrip: passed ? null : { label: 'fell', frame: 7 },
  path: new Float32Array([-100, seed * 20, 0, 100, seed * 20, 0]),
});

describe('Case trails on the canvas overlay', () => {
  it('draws each path once and picks a failed trail in screen pixels', () => {
    const ctx = context();
    const trails = new CaseTrails(ctx);
    const replay = vi.fn();

    trails.set([outcome(1, true), outcome(2, false)], replay);
    expect(trails.state()).toHaveLength(2);
    expect(ctx.stage.overlays.children[0].children).toHaveLength(2);
    expect(trails.pick(500, 465)?.seed).toBe(2);
    expect(trails.pick(500, 483)).toBeNull();
    expect(trails.pick(10, 10)).toBeNull();

    const event = (type: string, x: number, y: number) =>
      Object.assign(new Event(type, { cancelable: true }), { button: 0, clientX: x, clientY: y });
    const canvas = ctx.stage.renderer.domElement;
    const up = event('pointerup', 500, 465);

    canvas.dispatchEvent(event('pointerdown', 500, 465));
    canvas.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(replay).toHaveBeenCalledWith(2);
    replay.mockClear();
    canvas.dispatchEvent(event('pointerdown', 500, 465));
    canvas.dispatchEvent(event('pointerup', 550, 465));
    expect(replay).not.toHaveBeenCalled();
    trails.set([], replay);
    expect(trails.state()).toHaveLength(0);
    trails.dispose();
    expect(ctx.stage.overlays.children).toHaveLength(0);
  });
});
