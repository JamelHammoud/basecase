import type { Studio } from '../types';

export default function worldsStudio(studio: Studio) {
  return {
    worldState: () => studio().core.viewportRef.current?.importedWorldState() ?? null,
  };
}
