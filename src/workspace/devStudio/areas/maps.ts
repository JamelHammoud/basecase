import type { Studio } from '../types';

export default function mapsStudio(studio: Studio) {
  return {
    mapMatching: () => studio().core.dataLayers.matching(),
  };
}
