import type { InferenceSession, Tensor } from 'onnxruntime-web';
import type { VisionModelManifest } from './manifest';
import { prepareFrame } from './preprocess';
import { decodeVision, type VisionOutputs } from './decode';
import type { RgbaFrame, VisionBackend, VisionResult } from './protocol';

type Runtime = typeof import('onnxruntime-web');

interface LoadedModel {
  manifest: VisionModelManifest;
  session: InferenceSession;
  runtime: Runtime;
  backend: VisionBackend;
  running: Promise<unknown>;
}

let runtimePromise: Promise<Runtime> | null = null;

async function visionRuntime(): Promise<Runtime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const browser = typeof location !== 'undefined';
    const runtime = browser ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web');

    runtime.env.wasm.numThreads = 1;
    runtime.env.wasm.proxy = false;

    if (browser) (await import('./runtimeAssets')).configureRuntimeAssets(runtime.env);

    return runtime;
  })();

  return runtimePromise;
}

async function createSession(runtime: Runtime, bytes: Uint8Array, backend: VisionBackend) {
  if (backend === 'wasm')
    return { session: await runtime.InferenceSession.create(bytes, { executionProviders: ['wasm'] }), backend };

  try {
    return {
      session: await runtime.InferenceSession.create(bytes, { executionProviders: ['webgpu'] }),
      backend,
    };
  } catch {
    return {
      session: await runtime.InferenceSession.create(bytes, { executionProviders: ['wasm'] }),
      backend: 'wasm' as const,
    };
  }
}

function tensorOutputs(outputs: InferenceSession.ReturnType): VisionOutputs {
  return Object.fromEntries(
    Object.entries(outputs).map(([name, tensor]) => {
      if (tensor.type !== 'float32') throw new Error('Model output must use float32.');

      return [name, { dims: tensor.dims, data: tensor.data as Float32Array }];
    }),
  );
}

function releaseTensors(tensors: Record<string, Tensor>): void {
  for (const tensor of Object.values(tensors)) tensor.dispose();
}

export class VisionEngine {
  private models = new Map<string, LoadedModel>();
  private generation = 0;
  private modelGenerations = new Map<string, number>();

  async load(manifest: VisionModelManifest, bytes: Uint8Array, options: { backend?: VisionBackend } = {}) {
    const generation = this.generation;
    const modelGeneration = this.modelGenerations.get(manifest.id);
    const runtime = await visionRuntime();
    const preferred =
      options.backend ?? (typeof navigator !== 'undefined' && Reflect.get(navigator, 'gpu') ? 'webgpu' : 'wasm');
    const loaded = await createSession(runtime, bytes, preferred);

    if (generation !== this.generation || modelGeneration !== this.modelGenerations.get(manifest.id)) {
      await loaded.session.release();

      throw new Error('The camera is closed.');
    }

    const previous = this.models.get(manifest.id);

    this.models.set(manifest.id, { ...loaded, manifest, runtime, running: Promise.resolve() });
    await previous?.running.catch(() => undefined);
    await previous?.session.release();

    return { backend: loaded.backend };
  }

  async infer(
    modelId: string,
    frame: RgbaFrame,
    metadata: { camera: string; timestamp: number; mediaTime?: number; threshold?: number },
  ): Promise<VisionResult> {
    const loaded = this.models.get(modelId);

    if (!loaded) throw new Error('Load the camera model first.');

    const task = loaded.running.catch(() => undefined).then(() => this.run(loaded, frame, metadata));

    loaded.running = task;

    return task;
  }

  private async run(
    loaded: LoadedModel,
    frame: RgbaFrame,
    metadata: { camera: string; timestamp: number; mediaTime?: number; threshold?: number },
  ): Promise<VisionResult> {
    const start = performance.now();
    const prepared = prepareFrame(frame, loaded.manifest);
    const input = new loaded.runtime.Tensor('float32', prepared.data, prepared.dims);
    const inputName = loaded.manifest.inputName ?? loaded.session.inputNames[0];
    let outputs: InferenceSession.ReturnType = {};

    try {
      outputs = await loaded.session.run({ [inputName]: input });

      return {
        modelId: loaded.manifest.id,
        kind: loaded.manifest.kind,
        camera: metadata.camera,
        timestamp: metadata.timestamp,
        mediaTime: metadata.mediaTime,
        width: frame.width,
        height: frame.height,
        ...decodeVision(tensorOutputs(outputs), loaded.manifest, prepared.transform, metadata.threshold),
        elapsedMs: performance.now() - start,
      };
    } finally {
      input.dispose();
      releaseTensors(outputs);
    }
  }

  async dispose(modelId?: string): Promise<void> {
    if (modelId) this.modelGenerations.set(modelId, (this.modelGenerations.get(modelId) ?? 0) + 1);
    else this.generation++;

    const models = modelId
      ? [this.models.get(modelId)].filter((model) => model !== undefined)
      : [...this.models.values()];

    if (modelId) this.models.delete(modelId);

    if (!modelId) this.models.clear();

    await Promise.all(
      models.map(async (model) => {
        await model.running.catch(() => undefined);
        await model.session.release();
      }),
    );
  }
}
