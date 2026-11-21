import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBitmap } from '../../utils/imageEncode';
import { captureScreenshot, Hider, hideForViews, viewDirection } from './captures';
import type { ViewportContext } from './viewportContext';

vi.mock('../../utils/imageEncode', () => ({ encodeBitmap: vi.fn(), encodeLabelled: vi.fn() }));

const drawImage = vi.fn();
const bitmap = { width: 560, height: 350 } as ImageBitmap;

class CanvasCopy {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return { drawImage };
  }

  transferToImageBitmap() {
    return bitmap;
  }
}

function captureContext() {
  const helper = new THREE.Group();
  const overlays = new THREE.Group();
  const brushCursor = new THREE.Group();
  const canvas = { width: 1920, height: 1200, toDataURL: vi.fn() };
  const renderNow = vi.fn();
  const ctx = {
    stage: { renderer: { domElement: canvas }, overlays, brushCursor },
    loop: { renderNow },
  } as unknown as ViewportContext;

  brushCursor.visible = false;

  return { ctx, helper, overlays, brushCursor, canvas, renderNow };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('OffscreenCanvas', CanvasCopy);
});

afterEach(() => vi.unstubAllGlobals());

describe('capture directions', () => {
  it('retains exact preset directions and independent results without repeated normalization', () => {
    const presets = [
      { view: 'iso', source: new THREE.Vector3(0.9, 0.7, 1.2) },
      { view: 'front', source: new THREE.Vector3(0, 0.08, 1) },
      { view: 'back', source: new THREE.Vector3(0, 0.08, -1) },
      { view: 'side', source: new THREE.Vector3(1, 0.08, 0) },
      { view: 'top', source: new THREE.Vector3(0, 1, 0.001) },
      { view: 'unknown', source: new THREE.Vector3(0.9, 0.7, 1.2) },
    ].map(({ view, source }) => ({ view, expected: source.normalize() }));
    const normalize = vi.spyOn(THREE.Vector3.prototype, 'normalize');

    try {
      for (let i = 0; i < 100; i++) {
        for (const { view, expected } of presets) {
          const direction = viewDirection(view);

          expect(direction).toEqual(expected);
          direction.set(100, -200, 300);
        }
      }

      expect(normalize).not.toHaveBeenCalled();
    } finally {
      normalize.mockRestore();
    }
  });

  it.each([
    { az: 0, el: 0 },
    { az: 90, el: 45 },
    { az: -135, el: -60 },
    { az: 360, el: 100 },
    { az: 12.5, el: -100 },
  ])('preserves custom azimuth $az and clamped elevation $el', ({ az, el }) => {
    const azimuth = THREE.MathUtils.degToRad(az);
    const elevation = THREE.MathUtils.degToRad(Math.max(-89, Math.min(89, el)));

    expect(viewDirection(`az:${az},el:${el}`)).toEqual(
      new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      ),
    );
  });
});

describe('current-view captures', () => {
  it('copies the rendered frame and restores helpers before the worker finishes encoding', async () => {
    const { ctx, helper, overlays, brushCursor, canvas, renderNow } = captureContext();
    let finish = (_dataUrl: string) => {};

    vi.mocked(encodeBitmap).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    drawImage.mockImplementationOnce(() => {
      expect([helper.visible, overlays.visible, brushCursor.visible]).toEqual([false, false, false]);
      expect(renderNow).toHaveBeenCalledTimes(1);
    });

    const shot = captureScreenshot(ctx, helper);

    expect([helper.visible, overlays.visible, brushCursor.visible]).toEqual([true, true, false]);
    expect(renderNow).toHaveBeenCalledTimes(2);
    expect(canvas.toDataURL).not.toHaveBeenCalled();
    expect(encodeBitmap).toHaveBeenCalledWith({ bitmap, type: 'image/png' });
    expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0, 1920, 1200);
    finish('data:image/png;base64,frame');
    await expect(shot).resolves.toBe('data:image/png;base64,frame');
  });

  it('encodes a preview once at its final dimensions and restores helpers if copying fails', async () => {
    const { ctx, helper, overlays, canvas } = captureContext();

    vi.mocked(encodeBitmap).mockResolvedValueOnce('data:image/jpeg;base64,preview');

    await expect(captureScreenshot(ctx, helper, 560)).resolves.toBe('data:image/jpeg;base64,preview');
    expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0, 560, 350);
    expect(encodeBitmap).toHaveBeenCalledExactlyOnceWith({
      bitmap,
      type: 'image/jpeg',
      quality: 0.86,
      background: '#1b1b1b',
    });
    drawImage.mockImplementationOnce(() => {
      throw new Error('Copy failed');
    });

    expect(() => captureScreenshot(ctx, helper)).toThrow('Copy failed');
    expect([helper.visible, overlays.visible]).toEqual([true, true]);
  });
});

function isolationContext(count = 4) {
  const partsRoot = new THREE.Group();
  const worldRoot = new THREE.Group();
  const children = Array.from({ length: count }, (_, i) => {
    const child = new THREE.Group();

    child.userData.partId = `part-${i}`;
    partsRoot.add(child);

    return child;
  });
  const ctx = {
    stage: { partsRoot, worldRoot },
    layer: { part: (id: string) => ({ kind: id === 'part-2' ? 'image_plane' : 'box' }) },
  } as unknown as ViewportContext;

  children[3].visible = false;

  return { ctx, children, worldRoot };
}

describe('capture part isolation', () => {
  it.each([
    { ids: undefined, visible: [true, true, false, false], world: true },
    { ids: [], visible: [true, true, false, false], world: true },
    { ids: ['part-1', 'part-1', 'part-2', 'part-3', 'missing'], visible: [false, true, false, false], world: false },
    { ids: ['missing'], visible: [false, false, false, false], world: false },
  ])('preserves isolation and restoration for $ids', ({ ids, visible, world }) => {
    const { ctx, children, worldRoot } = isolationContext();
    const hider = new Hider();
    const original = ids?.slice();

    hideForViews(ctx, hider, ids);

    expect(children.map((child) => child.visible)).toEqual(visible);
    expect(worldRoot.visible).toBe(world);
    expect(ids).toEqual(original);
    hider.restore();
    hider.restore();
    expect(children.map((child) => child.visible)).toEqual([true, true, true, false]);
    expect(worldRoot.visible).toBe(true);
  });

  it('reads requested ids once and refreshes membership on the next capture', () => {
    const { ctx, children, worldRoot } = isolationContext(600);
    const ids = Array.from({ length: 300 }, (_, i) => `part-${i * 2}`);
    let reads = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];

      Object.defineProperty(ids, i, {
        configurable: true,
        get: () => {
          reads++;

          return id;
        },
      });
    }

    const hider = new Hider();

    hideForViews(ctx, hider, ids);

    expect(reads).toBe(300);
    expect(children.every((child, i) => child.visible === (i % 2 === 0 && i !== 2))).toBe(true);
    hider.restore();
    ids.length = 0;
    ids.push('part-1');
    worldRoot.visible = false;
    hideForViews(ctx, hider, ids);

    expect(children.filter((child) => child.visible)).toEqual([children[1]]);
    hider.restore();
    expect(worldRoot.visible).toBe(false);
  });
});
