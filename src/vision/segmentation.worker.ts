import { env } from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import moduleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { SegmentationEngine } from './segmentationEngine';
import { SEGMENTATION_MODELS } from './segmentationModels';
import type { SegmentationGraph } from './segmentationModels';
import type { SegmentationPoint } from './segmentationMath';
import { modelBytes } from './modelCache';
import type { VisionPixels } from './types';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new SegmentationEngine();
const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('2d', { willReadFrequently: true })!;
let running = Promise.resolve();

env.wasm.wasmPaths = { wasm: wasmUrl, mjs: moduleUrl };
env.wasm.numThreads = 1;

function pixels(frame: ImageBitmap | VisionPixels) {
  if ('data' in frame) return frame;

  canvas.width = frame.width;
  canvas.height = frame.height;
  context.drawImage(frame, 0, 0);

  return context.getImageData(0, 0, frame.width, frame.height);
}

async function command(data: Record<string, unknown>) {
  if (data.type === 'reset') return engine.reset();

  if (data.type === 'load') {
    const sources = data.sources as Partial<Record<SegmentationGraph, string>>;
    const files = {} as Record<SegmentationGraph, Uint8Array>;

    for (const name of Object.keys(SEGMENTATION_MODELS) as SegmentationGraph[])
      files[name] = await modelBytes(SEGMENTATION_MODELS[name], sources[name]);

    return engine.load(files);
  }

  const frame = data.frame as ImageBitmap | VisionPixels;

  try {
    if (data.type === 'segment') return await engine.segment(pixels(frame), data.points as SegmentationPoint[]);

    if (data.type === 'next') return await engine.next(pixels(frame));

    throw new Error('Choose a segmentation command.');
  } finally {
    if (!('data' in frame)) frame.close();
  }
}

scope.onmessage = ({ data }) => {
  running = running.then(async () => {
    try {
      const result = await command(data);

      scope.postMessage({ id: data.id, result });
    } catch (error) {
      scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
