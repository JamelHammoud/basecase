import { InferenceSession, Tensor } from 'onnxruntime-web/webgpu';
import type { VisionSessionFactory } from './engine';
import type { VisionPixels } from './types';
import { preprocess } from './preprocess';
import { verifyModelBytes } from './verifyBytes';
import { SEGMENTATION_MODELS } from './segmentationModels';
import type { SegmentationGraph } from './segmentationModels';
import constants from './segmentationConstants.json';
import {
  segmentationBank,
  segmentationMask,
  segmentationPointers,
  segmentationPoints,
  segmentationSequence,
} from './segmentationMath';
import type { SegmentationMemory, SegmentationPoint } from './segmentationMath';

type Outputs = Record<string, Tensor>;

const float = (data: Float32Array, dims: number[]) => new Tensor('float32', data, dims);
const dispose = (outputs: Outputs) => Object.values(outputs).forEach((tensor) => tensor.dispose());
const values = (tensor: Tensor) => {
  if (!(tensor.data instanceof Float32Array)) throw new Error('The segmentation model returned an unsupported tensor.');

  return tensor.data;
};

export class SegmentationEngine {
  private sessions = new Map<SegmentationGraph, InferenceSession>();
  private initial?: SegmentationMemory;
  private recent: SegmentationMemory[] = [];
  private index = 0;
  private dimensions?: [number, number];
  private create: VisionSessionFactory;

  constructor(
    create: VisionSessionFactory = (bytes, provider) =>
      InferenceSession.create(bytes, { executionProviders: [provider] }),
  ) {
    this.create = create;
  }

  async load(files: Record<SegmentationGraph, Uint8Array>) {
    await this.close();

    try {
      for (const name of Object.keys(SEGMENTATION_MODELS) as SegmentationGraph[]) {
        await verifyModelBytes(files[name], SEGMENTATION_MODELS[name]);

        const session = await this.create(files[name], 'webgpu').catch(() => this.create(files[name], 'wasm'));

        this.sessions.set(name, session);
      }
    } catch (error) {
      await this.close();

      throw error;
    }
  }

  private run(name: SegmentationGraph, feeds: Outputs) {
    const session = this.sessions.get(name);

    if (!session) throw new Error('Load the segmentation model before labeling.');

    return session.run(feeds) as Promise<Outputs>;
  }

  private async conditioned(vision: Outputs) {
    if (!this.initial) return { feats: vision.feats2_no_mem, owned: [] as Outputs[] };

    const pointers = segmentationPointers(this.initial, this.recent);
    const diffs = float(
      Float32Array.from(pointers, (entry) => (this.index - entry.index) / 15),
      [16],
    );
    let positional: Outputs = {};
    const feeds: Outputs = {};

    try {
      positional = await this.run('pointer_tpos', { normalized_diffs: diffs });

      const bank = segmentationBank({
        initial: this.initial,
        recent: this.recent,
        frame: this.index,
        temporal: constants.memory_temporal_positional_encoding,
        pointerPosition: values(positional.pointer_pos),
      });

      feeds.current_vision_features = float(segmentationSequence(values(vision.feats2)), [4096, 1, 256]);
      feeds.current_vision_position_embeddings = float(
        segmentationSequence(values(vision.vision_pos_embed)),
        [4096, 1, 256],
      );
      feeds.memory = float(bank.memory, [28736, 1, 64]);
      feeds.memory_pos = float(bank.position, [28736, 1, 64]);

      const attention = await this.run('memory_attention', feeds);

      return { feats: attention.conditioned_feats, owned: [attention] };
    } finally {
      diffs.dispose();
      dispose(positional);
      dispose(feeds);
    }
  }

  async segment(frame: VisionPixels, points: SegmentationPoint[]) {
    segmentationPoints(points, frame.width, frame.height);
    this.reset();
    this.dimensions = [frame.width, frame.height];

    return this.infer(frame, points);
  }

  async next(frame: VisionPixels) {
    if (!this.initial) throw new Error('Label the first frame before tracking.');

    if (this.index >= 31) throw new Error('Track up to 30 frames at a time.');

    if (frame.width !== this.dimensions?.[0] || frame.height !== this.dimensions?.[1])
      throw new Error('Keep tracked frames the same size.');

    return this.infer(frame);
  }

  private async remember(vision: Outputs, decoded: Outputs, prompted: boolean) {
    const score = float(new Float32Array(values(decoded.object_score_logits)), [1, 1]);
    const binarize = float(new Float32Array([Number(prompted)]), []);
    let memory: Outputs = {};

    try {
      memory = await this.run('memory_encoder', {
        feats2: vision.feats2,
        high_res_mask: decoded.high_res_mask,
        object_score_logits: score,
        binarize,
      });

      const entry = {
        index: this.index,
        tokens: new Float32Array(values(memory.memory_tokens)),
        position: new Float32Array(values(memory.memory_pos)),
        pointer: new Float32Array(values(decoded.object_pointer)),
      };

      if (prompted) this.initial = entry;
      else this.recent = [...this.recent.slice(-14), entry];

      this.index++;
    } finally {
      score.dispose();
      binarize.dispose();
      dispose(memory);
    }
  }

  private async infer(frame: VisionPixels, points?: SegmentationPoint[]) {
    const input = preprocess(frame, {
      width: 1024,
      height: 1024,
      layout: 'nchw',
      mean: constants.image_mean,
      std: constants.image_std,
      resize: 'stretch',
    });
    const prompt = points
      ? segmentationPoints(points, frame.width, frame.height)
      : { points: new Float32Array([0, 0]), labels: new Int32Array([-1]) };
    const pixels = float(input.data, input.dims);
    const coordinates = float(prompt.points, [1, 1, prompt.labels.length, 2]);
    const labels = new Tensor('int32', prompt.labels, [1, 1, prompt.labels.length]);
    let vision: Outputs = {};
    let decoded: Outputs = {};
    let owned: Outputs[] = [];

    try {
      vision = await this.run('vision_encoder', { pixel_values: pixels });

      const conditioned = await this.conditioned(vision);

      owned = conditioned.owned;
      decoded = await this.run('mask_decoder', {
        feats0: vision.feats0,
        feats1: vision.feats1,
        feats2_cond: conditioned.feats,
        input_points: coordinates,
        input_labels: labels,
      });

      const mask = segmentationMask(
        { data: values(decoded.high_res_mask), dims: decoded.high_res_mask.dims },
        frame.width,
        frame.height,
      );

      await this.remember(vision, decoded, Boolean(points));

      return mask;
    } catch (error) {
      this.reset();

      throw error;
    } finally {
      pixels.dispose();
      coordinates.dispose();
      labels.dispose();
      dispose(vision);
      dispose(decoded);
      owned.forEach(dispose);
    }
  }

  reset() {
    this.initial = undefined;
    this.recent = [];
    this.index = 0;
    this.dimensions = undefined;
  }

  async close() {
    this.reset();

    const sessions = [...this.sessions.values()];

    this.sessions.clear();
    await Promise.all(sessions.map((session) => session.release()));
  }
}
