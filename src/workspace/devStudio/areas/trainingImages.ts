import { base64Files } from '../base64Files';
import { listFrameSets, loadFrameSet } from '../../../vision/frameSetStore';
import { makeImageManifest, makeImages, type MakeImagesJob } from '../../../vision/makeImages';
import { storeFrame, type VisionFrame } from '../../../vision/frameSet';
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
    renderTrainingFixture: async (job: MakeImagesJob, summary = false) => {
      const start = performance.now();

      if (!summary) {
        const set = await makeImages(job);

        return { ...set, frames: set.frames.map(storeFrame) };
      }

      let imageBytes = 0;
      let depthPixels = 0;
      let annotated = 0;
      const samples: Pick<VisionFrame, 'seed' | 'camera' | 'width' | 'height' | 'annotations'>[] = [];
      const set = await makeImageManifest(job, {
        onFrame: (frame) => {
          imageBytes += frame.image.byteLength;
          depthPixels += frame.depth.length;
          annotated += frame.annotations.length;

          if (samples.length < 500)
            samples.push({
              seed: frame.seed,
              camera: frame.camera,
              width: frame.width,
              height: frame.height,
              annotations: frame.annotations.map((annotation) => ({
                ...annotation,
                mask: { size: [0, 0], counts: [] },
                polygons: [],
              })),
            });
        },
      });

      return { ...set, imageBytes, depthPixels, annotated, samples, elapsedMs: performance.now() - start };
    },
  };
}
