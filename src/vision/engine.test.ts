import { describe, expect, it } from 'vitest';
import { VisionEngine } from './engine';
import { testVisionModel, TEST_VISION_MANIFEST } from './testModel';

const frame = (brightness: number) => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(brightness) });

describe('real ONNX vision inference', () => {
  it('runs image pixels through WASM, decodes detections, preserves timestamps and releases the model', async () => {
    const engine = new VisionEngine();
    const loaded = await engine.load(TEST_VISION_MANIFEST, testVisionModel(), { backend: 'wasm' });

    expect(loaded.backend).toBe('wasm');

    const bright = await engine.infer(TEST_VISION_MANIFEST.id, frame(255), { camera: 'front', timestamp: 80 });
    const dark = await engine.infer(TEST_VISION_MANIFEST.id, frame(0), { camera: 'front', timestamp: 81 });

    expect(bright.detections?.[0]).toEqual({ classId: 0, label: 'person', score: 1, box: [0.25, 0.25, 0.5, 0.5] });
    expect(bright.timestamp).toBe(80);
    expect(bright.camera).toBe('front');
    expect(bright.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(dark.detections).toEqual([]);
    await engine.dispose();
    await expect(engine.infer(TEST_VISION_MANIFEST.id, frame(0), { camera: 'front', timestamp: 90 })).rejects.toThrow(
      'Load',
    );
  });

  it('falls back to WASM when WebGPU cannot create a session', async () => {
    const engine = new VisionEngine();
    const loaded = await engine.load(TEST_VISION_MANIFEST, testVisionModel(), { backend: 'webgpu' });

    expect(loaded.backend).toBe('wasm');

    const result = await engine.infer(TEST_VISION_MANIFEST.id, frame(255), { camera: 'front', timestamp: 1 });

    expect(result.detections?.[0].score).toBe(1);
    await engine.dispose();
  });

  it('rejects invalid model bytes without retaining a broken session', async () => {
    const engine = new VisionEngine();

    await expect(engine.load(TEST_VISION_MANIFEST, new Uint8Array([1, 2, 3]), { backend: 'wasm' })).rejects.toThrow();
    await engine.dispose();
  });

  it('keeps a different model loading when the last subscriber to one model leaves', async () => {
    const engine = new VisionEngine();

    await engine.load(TEST_VISION_MANIFEST, testVisionModel(), { backend: 'wasm' });

    const next = { ...TEST_VISION_MANIFEST, id: 'next-camera-model' };
    const loading = engine.load(next, testVisionModel(), { backend: 'wasm' });

    await engine.dispose(TEST_VISION_MANIFEST.id);
    await expect(loading).resolves.toEqual({ backend: 'wasm' });

    const seen = await engine.infer(next.id, frame(255), { camera: 'front', timestamp: 100 });

    expect(seen.detections?.[0].label).toBe('person');
    await expect(
      engine.infer(TEST_VISION_MANIFEST.id, frame(255), { camera: 'front', timestamp: 100 }),
    ).rejects.toThrow('Load');
    await engine.dispose();
  });

  it('still cancels an in-flight load when its own model is released', async () => {
    const engine = new VisionEngine();
    const loading = engine.load(TEST_VISION_MANIFEST, testVisionModel(), { backend: 'wasm' });
    const refused = expect(loading).rejects.toThrow('The camera is closed.');

    await engine.dispose(TEST_VISION_MANIFEST.id);
    await refused;
    await expect(
      engine.infer(TEST_VISION_MANIFEST.id, frame(255), { camera: 'front', timestamp: 100 }),
    ).rejects.toThrow('Load');
    await engine.dispose();
  });
});
