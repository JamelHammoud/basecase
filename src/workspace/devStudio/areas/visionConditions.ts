import { realTrainingImages } from '../visionBackendFixture';
import { exportCoco } from '../../../vision/cocoExport';

export default function visionConditionsStudio() {
  return {
    visionConditionImport: async (requirements = false) => {
      const set = await realTrainingImages();

      set.name = 'Rover conditions';

      if (requirements) {
        const original = set.frames[2];

        for (const level of [240, 32]) {
          const canvas = new OffscreenCanvas(2, 2);
          const context = canvas.getContext('2d')!;

          context.fillStyle = `rgb(${level},${level},${level})`;
          context.fillRect(0, 0, 2, 2);
          set.frames.push({
            ...structuredClone(original),
            id: `test-${level}`,
            jpeg: new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer()),
          });
        }
      }

      return Object.fromEntries(Object.entries(exportCoco(set)).map(([path, bytes]) => [path, [...bytes]]));
    },
  };
}
