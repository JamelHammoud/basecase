import type { WorldItem } from '../../../sim/mjcfTypes';
import type { ScenePart } from '../../../types/robotics';
import type { Studio } from '../types';

const isPiece = (part: ScenePart) => (part as Partial<WorldItem>).hull !== undefined || part.visible === false;

export default function worldsStudio(studio: Studio) {
  return {
    worldLayer: () => {
      const { core } = studio();

      return {
        look: core.viewportRef.current?.worldLookKind() ?? null,
        pieces: core.simTraining.sim.worldParts.filter(isPiece).length,
      };
    },
  };
}
