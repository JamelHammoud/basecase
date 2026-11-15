import { getWorldAsset, sceneWorldAssets, serializeWorldAssets, restoreWorldAssets } from '../../../cases/worldAssets';
import { caseVerdict } from '../../caseChecks';
import type { Studio } from '../types';

export default function mapsStudio(studio: Studio) {
  return {
    mapWorldVerdict: async () => {
      const { core } = studio();
      const viewport = core.viewportRef.current;
      const kase = core.simTraining.cases.active;

      if (!viewport || !kase) return null;

      await viewport.meshesReady();

      const verdict = await caseVerdict(
        {
          parts: core.docs.partsRef.current,
          project: core.docs.projectRef.current,
          measures: await viewport.measureParts(),
          partTriangles: viewport.partTriangles,
        },
        kase,
        1,
      );

      return { seed: 1, ...verdict.runs };
    },
    mapMatching: () => studio().core.dataLayers.matching(),
    mapWorldState: async () => {
      const { core } = studio();
      const project = core.docs.projectRef.current;
      const persisted = serializeWorldAssets(sceneWorldAssets(project));
      const restored = await restoreWorldAssets(JSON.parse(JSON.stringify(persisted)));
      const imported = core.simTraining.cases.active?.world.imported;
      const asset = imported && getWorldAsset(imported.hash);

      return {
        imported,
        saved: imported ? !!restored[imported.hash] : false,
        pieces: asset?.pieces.length ?? 0,
        reconstruction: asset?.world.reconstruction ?? null,
      };
    },
  };
}
