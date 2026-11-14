import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { base64Files } from '../base64Files';
import type { Studio } from '../types';

export default function datasetsStudio(studio: Studio) {
  return {
    datasetFiles: async () => {
      const { cases } = studio().core.simTraining;
      const zip = await cases.dataset.zip(cases.tries);

      return zip && base64Files(unzipSync(zip));
    },
  };
}
