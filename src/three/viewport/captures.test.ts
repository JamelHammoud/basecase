import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBitmap } from '../../utils/imageEncode';
import { captureScreenshot } from './captures';
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
