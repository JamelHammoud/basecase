import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { base64Files } from '../base64Files';
import type { Studio } from '../types';

export default function datasetsStudio(studio: Studio) {
  return {
    datasetFiles: async () => {
      const { triesView, simTraining } = studio().core;
      const { cases } = simTraining;
      const open = triesView.open ? triesView.dataset : null;
      const zip = await (open ? cases.dataset.zipDataset(open) : cases.dataset.zip(cases.tries));

      return zip && base64Files(unzipSync(zip));
    },
    datasets: () => studio().core.triesView.datasets,
  };
}
