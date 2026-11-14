import { base64Files } from '../base64Files';
import { listFrameSets, loadFrameSet } from '../../../vision/frameSetStore';
import { makeImages, type MakeImagesJob } from '../../../vision/makeImages';
import { storeFrame } from '../../../vision/frameSet';
import { exportCoco } from '../../../vision/coco';
import type { Studio } from '../types';

export default function trainingImagesStudio(studio: Studio) {
  return {
    trainingImages: () => {
      const { busy, progress, problem } = studio().core.trainingImages;

      return { busy, progress, problem };
    },
    frameSets: listFrameSets,
    frameSet: async (id: string) => {
      const set = await loadFrameSet(id);

      return (
        set && {
          ...set,
          frames: set.frames.map(({ image, depth, ...frame }) => ({
            ...frame,
            imageBytes: image.byteLength,
            depthPixels: depth.length,
          })),
        }
      );
    },
    frameSetFiles: async (id: string) => {
      const set = await loadFrameSet(id);

      return set ? base64Files(exportCoco(set)) : null;
    },
    renderTrainingFixture: async (job: MakeImagesJob) => {
      const set = await makeImages(job);

      return { ...set, frames: set.frames.map(storeFrame) };
    },
  };
}
