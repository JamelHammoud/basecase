import { loadFrameSet } from '../vision/frameSetStore';
import type { ImageClass } from '../vision/frameSet';
import { evaluationWorker } from '../vision/training/evaluationWorker';

export interface OriginalImageExpectation {
  hash: string;
  classes?: ImageClass[];
  current: () => boolean;
}

export async function readFrameLabelSet(
  input: {
    id: string;
    frameId?: string;
    expected?: OriginalImageExpectation;
  },
  load = loadFrameSet,
) {
  const { expected } = input;

  if (expected && !expected.current()) return undefined;

  const set = await load(input.id);

  if (!expected) return set;

  const frame = set?.frames.find((entry) => entry.id === input.frameId);
  const classesMatch = !expected.classes || JSON.stringify(expected.classes) === JSON.stringify(set?.classes);

  if (!frame || !classesMatch || (await evaluationWorker.call('frameHash', frame)) !== expected.hash)
    throw new Error('Original image is unavailable');

  return expected.current() ? set : undefined;
}
