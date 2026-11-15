import { InferenceSession, env } from 'onnxruntime-web/webgpu';
import { SegmentationEngine } from './segmentationEngine';
import type { SegmentationGraph } from './segmentationModels';
import { decodeMask } from './imageMasks';

interface Measurement {
  frame: number;
  foreground: number;
  iou: number;
  ms: number;
}

function compareMask(actual: Uint8Array, seed: Uint8Array, shift: number): Omit<Measurement, 'frame' | 'ms'> {
  let intersection = 0;
  let union = 0;
  let foreground = 0;

  for (let i = 0; i < actual.length; i++) {
    const expected = i % 640 >= shift ? seed[i - shift] : 0;

    foreground += actual[i];
    intersection += Number(Boolean(actual[i] && expected));
    union += Number(Boolean(actual[i] || expected));
  }

  return { foreground, iou: union ? intersection / union : 0 };
}

export async function runSegmentationAcceptance(options: {
  models: Record<SegmentationGraph, Uint8Array>;
  jpeg: Uint8Array;
  onProgress?: (measurement: Measurement) => void;
}) {
  env.wasm.wasmPaths = {
    wasm: '/ort/ort-wasm-simd-threaded.asyncify.wasm',
    mjs: '/ort/ort-wasm-simd-threaded.asyncify.mjs',
  };
  env.wasm.numThreads = 1;

  const engine = new SegmentationEngine((bytes) =>
    InferenceSession.create(bytes, { executionProviders: ['webgpu'], logSeverityLevel: 3 }),
  );
  const photo = await createImageBitmap(new Blob([Uint8Array.from(options.jpeg)], { type: 'image/jpeg' }));
  const canvas = new OffscreenCanvas(640, 480);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const measurements: Measurement[] = [];
  let seed: Uint8Array = new Uint8Array(640 * 480);

  try {
    await engine.load(options.models);

    for (let frame = 0; frame <= 30; frame++) {
      context.fillStyle = '#555';
      context.fillRect(0, 0, 640, 480);
      context.drawImage(photo, frame, 0, 640, 480);

      const pixels = context.getImageData(0, 0, 640, 480);
      const start = performance.now();
      const mask = frame ? await engine.next(pixels) : await engine.segment(pixels, [{ x: 320, y: 250, label: 1 }]);
      const actual = decodeMask(mask);

      if (!frame) seed = actual;

      const measurement = { frame, ...compareMask(actual, seed, frame), ms: performance.now() - start };

      measurements.push(measurement);
      options.onProgress?.(measurement);

      if (measurement.iou < 0.9 || !measurement.foreground || measurement.foreground > actual.length * 0.95)
        throw new Error(`Segmentation tracking failed at frame ${frame}.`);
    }

    const pixels = context.getImageData(0, 0, 640, 480);
    const capped = await engine.next(pixels).then(
      () => false,
      (error: Error) => error.message.includes('30 frames'),
    );

    if (!capped) throw new Error('Segmentation tracking exceeded the frame limit.');

    engine.reset();

    const reset = await engine.next(pixels).then(
      () => false,
      (error: Error) => error.message.includes('first frame'),
    );

    if (!reset) throw new Error('Segmentation tracking retained a reset object.');

    return { backend: 'webgpu', width: 640, height: 480, frames: measurements, frameLimit: capped, reset };
  } finally {
    photo.close();
    await engine.close();
  }
}
