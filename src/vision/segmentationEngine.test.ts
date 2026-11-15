import { describe, expect, it, vi } from 'vitest';
import { SegmentationEngine } from './segmentationEngine';
import { SEGMENTATION_MODELS } from './segmentationModels';
import type { SegmentationGraph } from './segmentationModels';

const frame = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

describe('SAM 2 model and track boundaries', () => {
  it('requires an initial mask before processing another video frame', async () => {
    const engine = new SegmentationEngine();

    await expect(engine.next(frame)).rejects.toThrow(/first frame/);
    await engine.close();
  });

  it('verifies downloaded models before creating any inference session', async () => {
    const create = vi.fn();
    const engine = new SegmentationEngine(create);
    const files = Object.fromEntries(
      Object.keys(SEGMENTATION_MODELS).map((name) => [name, new Uint8Array(4)]),
    ) as Record<SegmentationGraph, Uint8Array>;

    await expect(engine.load(files)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    await engine.close();
  });

  it('refuses invalid source prompts before allocating tensors or loading models', async () => {
    const create = vi.fn();
    const engine = new SegmentationEngine(create);

    await expect(engine.segment(frame, [{ x: 3, y: 1, label: 1 }])).rejects.toThrow(/foreground point/);
    expect(create).not.toHaveBeenCalled();
    await engine.close();
  });
});
