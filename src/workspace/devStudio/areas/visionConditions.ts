import { realTrainingImages } from '../visionBackendFixture';
import { exportCoco } from '../../../vision/cocoExport';

export default function visionConditionsStudio() {
  return {
    visionConditionImport: async () => {
      const set = await realTrainingImages();

      set.name = 'Rover conditions';

      return Object.fromEntries(Object.entries(exportCoco(set)).map(([path, bytes]) => [path, [...bytes]]));
    },
  };
}
