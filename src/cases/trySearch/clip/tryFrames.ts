import { renderTryFrames } from '../../../datasets/datasetClient';
import type { TryFramesJob } from '../../../datasets/renderFrames';
import type { FrameVector } from '../types';
import { embedFrames } from './clipClient';

export async function frameVectorsOf(job: Omit<TryFramesJob, 'meshes'>): Promise<FrameVector[]> {
  const frames = await renderTryFrames(job);

  if (!frames.length) return [];

  const at = frames.map((f) => f.at);
  const vectors = await embedFrames(frames);

  return vectors.map((vector, i) => ({ at: at[i], vector }));
}
