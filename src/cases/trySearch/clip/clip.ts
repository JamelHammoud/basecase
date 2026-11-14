import type * as Ort from 'onnxruntime-web';
import { pixelValues, unitVector, IMAGE_SIZE, type ClipImage } from './clipImage';
import { CONTEXT_LENGTH, clipTokenizer } from './clipTokenizer';

export const EMBED_DIM = 512;

const BATCH = 8;

export interface ClipFiles {
  vision: Uint8Array;
  text: Uint8Array;
  merges: string;
}

export type ClipRuntime = Pick<typeof Ort, 'InferenceSession' | 'Tensor'>;

export interface Clip {
  embedText: (text: string) => Promise<Float32Array>;
  embedImages: (images: ClipImage[]) => Promise<Float32Array[]>;
}

const rows = (data: Float32Array, count: number) =>
  Array.from({ length: count }, (_, i) => unitVector(data.subarray(i * EMBED_DIM, (i + 1) * EMBED_DIM)));

export async function openClip(files: ClipFiles, ort: ClipRuntime): Promise<Clip> {
  const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' as const };
  const vision = await ort.InferenceSession.create(files.vision, options);
  const text = await ort.InferenceSession.create(files.text, options);
  const tokenizer = clipTokenizer(files.merges);

  const embedBatch = async (batch: ClipImage[]) => {
    const plane = 3 * IMAGE_SIZE * IMAGE_SIZE;
    const pixels = new Float32Array(batch.length * plane);

    batch.forEach((image, i) => pixelValues(image, IMAGE_SIZE, pixels.subarray(i * plane, (i + 1) * plane)));

    const input = new ort.Tensor('float32', pixels, [batch.length, 3, IMAGE_SIZE, IMAGE_SIZE]);
    const out = await vision.run({ pixel_values: input });

    return rows(out.image_embeds.data as Float32Array, batch.length);
  };

  return {
    embedText: async (words) => {
      const ids = BigInt64Array.from(tokenizer.encode(words), (id) => BigInt(id));
      const out = await text.run({ input_ids: new ort.Tensor('int64', ids, [1, CONTEXT_LENGTH]) });

      return rows(out.text_embeds.data as Float32Array, 1)[0];
    },
    embedImages: async (images) => {
      const vectors: Float32Array[] = [];

      for (let i = 0; i < images.length; i += BATCH) vectors.push(...(await embedBatch(images.slice(i, i + BATCH))));

      return vectors;
    },
  };
}
