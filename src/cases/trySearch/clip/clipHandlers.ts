import { reply } from '../../../utils/workerRpc';
import type { ClipImage } from './clipImage';
import { bundledClip } from './clipRuntime';

export const clipHandlers = {
  text: async (text: string) => {
    const vector = await (await bundledClip()).embedText(text);

    return reply(vector, [vector.buffer]);
  },
  images: async (images: ClipImage[]) => {
    const vectors = await (await bundledClip()).embedImages(images);

    return reply(
      vectors,
      vectors.map((v) => v.buffer),
    );
  },
};

export type ClipHandlers = typeof clipHandlers;
