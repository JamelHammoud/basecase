import { InferenceSession, Tensor } from 'onnxruntime-web/webgpu';
import { validateVisionManifest } from './manifest';
import type { VisionManifest } from './manifest';
import { verifyModelBytes } from './verifyBytes';
import { preprocess } from './preprocess';
import { decode } from './decode';
import type { VisionFrameOptions, VisionOutputs, VisionPixels, VisionResult } from './types';

export type VisionSessionFactory = (bytes: Uint8Array, provider: 'webgpu' | 'wasm') => Promise<InferenceSession>;

const createSession: VisionSessionFactory = (bytes, provider) =>
  InferenceSession.create(bytes, { executionProviders: [provider] });

export class VisionEngine {
  private sessions = new Map<
    string,
    { manifest: VisionManifest; session: InferenceSession; running: Promise<void>; backend: 'webgpu' | 'wasm' }
  >();
  private create: VisionSessionFactory;
  private loading = new Map<string, symbol>();
  private closed = false;

  constructor(create: VisionSessionFactory = createSession) {
    this.create = create;
  }

  async load(value: unknown, bytes: Uint8Array) {
    const manifest = validateVisionManifest(value);

    if (this.closed) throw new Error('The vision runtime is closed.');

    const generation = Symbol();

    this.loading.set(manifest.id, generation);
    await verifyModelBytes(bytes, manifest.model);

    if (this.loading.get(manifest.id) !== generation) return;

    let backend: 'webgpu' | 'wasm' = 'webgpu';
    const session = await this.create(bytes, 'webgpu').catch(() => {
      backend = 'wasm';

      return this.create(bytes, 'wasm');
    });

    if (this.loading.get(manifest.id) !== generation) {
      await session.release();

      return;
    }

    const previous = this.sessions.get(manifest.id);

    this.sessions.set(manifest.id, { manifest, session, running: Promise.resolve(), backend });
    await previous?.running;
    await previous?.session.release();
  }

  async infer(modelId: string, pixels: VisionPixels, options: VisionFrameOptions = {}): Promise<VisionResult> {
    const loaded = this.sessions.get(modelId);

    if (!loaded) throw new Error('Load the vision model before running it.');

    const result = loaded.running.then(() => this.run(loaded, pixels, options));

    loaded.running = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private async run(
    loaded: { manifest: VisionManifest; session: InferenceSession; backend: 'webgpu' | 'wasm' },
    pixels: VisionPixels,
    options: VisionFrameOptions,
  ): Promise<VisionResult> {
    const input = preprocess(pixels, loaded.manifest.input);
    const tensor = new Tensor('float32', input.data, input.dims);
    let outputs: Awaited<ReturnType<InferenceSession['run']>> = {};

    try {
      outputs = await loaded.session.run({ [loaded.session.inputNames[0]]: tensor });

      return {
        modelId: loaded.manifest.id,
        backend: loaded.backend,
        source: options.source,
        camera: options.camera,
        timestamp: options.timestamp ?? performance.now(),
        width: pixels.width,
        height: pixels.height,
        ...decode(outputs as unknown as VisionOutputs, loaded.manifest, input.transform),
      };
    } finally {
      tensor.dispose();

      for (const output of Object.values(outputs)) output.dispose();
    }
  }

  async remove(modelId: string) {
    this.loading.delete(modelId);

    const loaded = this.sessions.get(modelId);

    this.sessions.delete(modelId);
    await loaded?.running;
    await loaded?.session.release();
  }

  async close() {
    this.closed = true;
    this.loading.clear();

    const sessions = [...this.sessions.values()];

    this.sessions.clear();
    await Promise.all(
      sessions.map(async ({ session, running }) => {
        await running;
        await session.release();
      }),
    );
  }
}
