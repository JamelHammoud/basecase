import { env } from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import moduleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';
import { modelBytes } from './modelCache';
import { validateVisionManifest } from './manifest';
import { VisionEngine } from './engine';
import { LatestFrameQueue } from './frameQueue';
import { visionMetadata } from './metadata';
import type { VisionPixels, VisionSource } from './types';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new VisionEngine();
const loading = new Map<string, symbol>();
const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('2d', { willReadFrequently: true })!;

env.wasm.wasmPaths = { wasm: wasmUrl, mjs: moduleUrl };
env.wasm.numThreads = 1;

interface FrameJob {
  frame: ImageBitmap | VideoFrame;
  modelId: string;
  source?: VisionSource;
  camera?: string;
  timestamp?: number;
  port: MessagePort;
  producer: MessagePort;
}

function pixels(frame: ImageBitmap | VideoFrame | VisionPixels): VisionPixels {
  if ('data' in frame) return frame;

  const width = 'displayWidth' in frame ? frame.displayWidth : frame.width;
  const height = 'displayHeight' in frame ? frame.displayHeight : frame.height;

  canvas.width = width;
  canvas.height = height;
  context.drawImage(frame, 0, 0);

  return context.getImageData(0, 0, width, height);
}

const queue = new LatestFrameQueue<FrameJob>(
  async (job) => {
    try {
      const result = visionMetadata(await engine.infer(job.modelId, pixels(job.frame), job));

      scope.postMessage({ type: 'result', result });
      job.port.postMessage({ type: 'result', result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      scope.postMessage({
        type: 'error',
        source: job.source,
        camera: job.camera,
        modelId: job.modelId,
        timestamp: job.timestamp,
        error: message,
      });
      job.port.postMessage({
        type: 'error',
        source: job.source,
        camera: job.camera,
        modelId: job.modelId,
        timestamp: job.timestamp,
        error: message,
      });
    }
  },
  (job) =>
    job.port.postMessage({
      type: 'dropped',
      dropped: true,
      source: job.source,
      camera: job.camera,
      modelId: job.modelId,
      timestamp: job.timestamp,
    }),
);

function attach(port: MessagePort) {
  port.onmessage = ({ data }) => {
    if (data?.type === 'detach') {
      queue.removeProducer(port);
      port.onmessage = null;
      port.close();

      return;
    }

    if (data?.type === 'frame' && data.frame) queue.push({ ...data, port, producer: port });
  };
  port.start();
}

scope.onmessage = async ({ data }) => {
  if (data.type === 'attach') {
    attach(data.port);

    return;
  }

  try {
    const result = await command(data);

    scope.postMessage({ type: 'reply', id: data.id, result });
  } catch (error) {
    scope.postMessage({ type: 'reply', id: data.id, error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (data.type === 'infer' && !('data' in data.frame)) data.frame.close();
  }
};

async function command(data: Record<string, unknown>) {
  if (data.type === 'load') return load(data);

  if (data.type === 'infer')
    return engine.infer(String(data.modelId), pixels(data.frame as ImageBitmap | VisionPixels), data.options as object);

  if (data.type === 'remove') {
    loading.delete(String(data.modelId));

    return engine.remove(String(data.modelId));
  }

  if (data.type === 'close') {
    loading.clear();
    queue.close();

    await engine.close();
    scope.close();
  }
}

async function load(data: Record<string, unknown>) {
  const manifest = validateVisionManifest(data.manifest);
  const generation = Symbol();

  loading.set(manifest.id, generation);

  const bytes = data.bytes as Uint8Array | undefined;
  const downloaded = bytes ?? (await modelBytes(manifest.model, data.source as string | undefined));

  if (loading.get(manifest.id) !== generation) return;

  return engine.load(manifest, downloaded);
}
