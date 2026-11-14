import type { Studio } from '../types';

export default function sheetStudio(studio: Studio) {
  return {
    sheetProfile: async (id: string) => {
      const viewport = studio().core.viewportRef.current;

      if (!viewport) return null;

      await viewport.meshesReady();

      return (await viewport.measureParts([id]))[id]?.sheet ?? null;
    },
  };
}
