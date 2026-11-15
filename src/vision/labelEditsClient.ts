import { workerClient } from '../utils/workerRpc';
import type { LabelGeometry } from './labelEdits';
import type { labelEditsJobs } from './labelEditsJobs';
import type { ImageMask } from './frameSet';
import type { FrameLabelState } from './labelMerge';

const jobs = workerClient<typeof labelEditsJobs>(
  () => new Worker(new URL('./labelEdits.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./labelEditsJobs')).labelEditsJobs,
);

export const makeLabelGeometry = (input: LabelGeometry) => jobs.call('geometry', input);
export const makeMaskLabelGeometry = (input: Omit<LabelGeometry, 'pixels'> & { mask: ImageMask }) =>
  jobs.call('maskGeometry', input);
export const labelMaskPoint = (mask: ImageMask) => jobs.call('maskPoint', mask);
export const mergeFrameLabels = (input: {
  previous: FrameLabelState;
  next: FrameLabelState;
  stored: FrameLabelState;
}) => jobs.call('merge', input);
