import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InferenceSession, env } from 'onnxruntime-web/wasm';
import { VisionEngine } from './engine';
import { inputSensitiveDetectionOnnx, tinyDetectionOnnx } from './onnxFixture';
import type { VisionManifest } from './manifest';
import { visionMetadata } from './metadata';

env.wasm.numThreads = 1;

export function tinyManifest(bytes: Uint8Array): VisionManifest {
  return {
    version: 1,
    id: 'tiny-detection',
    kind: 'detect',
    adapter: 'generic',
    classes: ['person'],
    input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1] },
    model: {
      owner: 'test',
      repo: 'tiny',
      revision: 'a'.repeat(40),
      file: 'model.onnx',
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    },
  };
}

describe('vision inference pipeline', () => {
  it('changes detections when the camera pixels change on the same WASM session', async () => {
    const engine = new VisionEngine((bytes) => InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
    const bytes = inputSensitiveDetectionOnnx();

    await engine.load(tinyManifest(bytes), bytes);

    const black = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    const white = { ...black, data: new Uint8ClampedArray(16).fill(255) };
    const source = { scene: 'kitchen', kind: 'simulated' as const, id: 'kitchen-camera-feed' };
    const darkResult = await engine.infer('tiny-detection', black, { source, camera: 'wrist' });
    const lightResult = await engine.infer('tiny-detection', white);
    const repeated = await engine.infer('tiny-detection', white);

    expect(darkResult.source).toEqual(source);
    expect(darkResult.camera).toBe('wrist');
    expect(darkResult.detections).toEqual([]);
    expect(lightResult.detections).toHaveLength(1);
    expect(lightResult.detections[0].score).toBeCloseTo(1);
    expect(repeated.detections).toEqual(lightResult.detections);
    await engine.close();
  });

  it('falls back from WebGPU and runs a generated ONNX detector through real WASM', async () => {
    const providers: string[] = [];
    const engine = new VisionEngine(async (bytes, provider) => {
      providers.push(provider);

      if (provider === 'webgpu') throw new Error('no GPU');

      return InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    });
    const bytes = tinyDetectionOnnx();

    await engine.load(tinyManifest(bytes), bytes);

    const result = await engine.infer(
      'tiny-detection',
      { width: 2, height: 2, data: new Uint8ClampedArray(16) },
      { camera: 'scene', timestamp: 123 },
    );

    expect(providers).toEqual(['webgpu', 'wasm']);
    expect(result.backend).toBe('wasm');
    expect(result).toMatchObject({
      modelId: 'tiny-detection',
      backend: 'wasm',
      camera: 'scene',
      timestamp: 123,
      detections: [{ label: 'person' }],
    });
    expect(result.detections[0].score).toBeCloseTo(0.9);
    expect(result.detections[0].box[0]).toBeCloseTo(0.1);
    await engine.close();
    await expect(
      engine.infer('tiny-detection', { width: 2, height: 2, data: new Uint8ClampedArray(16) }),
    ).rejects.toThrow(/Load/);
  });

  it('keeps relative depth arrays off subscription metadata', () => {
    const result = visionMetadata({
      modelId: 'depth',
      timestamp: 1,
      width: 2,
      height: 2,
      detections: [],
      depth: { width: 2, height: 2, relative: true, values: new Float32Array([1, 2, 3, 4]) },
    });

    expect(result.depth).toEqual({ width: 2, height: 2, relative: true, nearness: 0.5 });
  });
});

describe('vision model replacement', () => {
  it('keeps the newest model when an earlier session finishes loading out of order', async () => {
    let finish: (() => void) | undefined;
    let started: (() => void) | undefined;
    let calls = 0;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const releases: ReturnType<typeof vi.spyOn>[] = [];
    const engine = new VisionEngine(async (bytes) => {
      const call = ++calls;
      const session = await InferenceSession.create(bytes, { executionProviders: ['wasm'] });

      releases.push(vi.spyOn(session, 'release'));

      if (call === 1) {
        started!();
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      }

      return session;
    });
    const bytes = tinyDetectionOnnx();
    const original = { ...tinyManifest(bytes), classes: ['old'] };
    const replacement = { ...original, classes: ['new'] };
    const earlier = engine.load(original, bytes);

    await waiting;
    await engine.load(replacement, bytes);
    finish!();
    await earlier;

    const result = await engine.infer(original.id, { width: 2, height: 2, data: new Uint8ClampedArray(16) });

    expect(result.detections[0].label).toBe('new');
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).not.toHaveBeenCalled();
    await engine.close();
    expect(releases[1]).toHaveBeenCalledOnce();
  });
});
