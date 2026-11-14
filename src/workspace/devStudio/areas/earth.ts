import { earthBridge } from '../../../earth/earthBridge';
import type { Studio } from '../types';

export default function earthStudio(studio: Studio) {
  return {
    earth: () => studio().core.viewportRef.current?.earthState() ?? null,
    saveMapKey: (key: string) => earthBridge.setKey(key),
  };
}
