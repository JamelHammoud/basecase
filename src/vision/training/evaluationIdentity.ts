import type { FrozenImageSample } from '../../datasets/snapshotImages';

export const sampleKey = (sample: { frameSetId: string; frameId: string }) => `${sample.frameSetId}:${sample.frameId}`;

export function canonicalTest(samples: FrozenImageSample[]): string {
  return JSON.stringify(
    [...samples]
      .sort((a, b) => (sampleKey(a) < sampleKey(b) ? -1 : Number(sampleKey(a) > sampleKey(b))))
      .map((sample) => ({
        frameSetId: sample.frameSetId,
        frameId: sample.frameId,
        source: sample.source,
        hash: sample.hash,
        content: sample.content,
        split: sample.split,
        explicit: sample.explicit,
      })),
  );
}
