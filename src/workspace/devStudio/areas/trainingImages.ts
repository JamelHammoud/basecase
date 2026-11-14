import { loadFrameSet } from '../../../vision/frameSetStore';
import { exportCoco } from '../../../vision/cocoExport';
import { base64Files } from '../base64Files';
import type { Studio } from '../types';

export default function trainingImagesStudio(studio: Studio) {
  const images = () => studio().core.simTraining.cases.images;

  return {
    trainingImages: () => ({ running: images().running, last: images().last }),
    trainingImageFiles: async () => {
      const result = images().last;

      const set = result ? await loadFrameSet(result.frameSet.id) : null;

      return set ? base64Files(exportCoco(set)) : null;
    },
  };
}
