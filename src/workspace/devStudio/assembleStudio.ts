import type { Studio, StudioArea, StudioHooks } from './types';

export const areaName = (path: string) => path.replace(/^.*\//, '').replace(/\.ts$/, '');

export function assembleStudio(areas: Record<string, StudioArea>, studio: Studio) {
  const hooks: StudioHooks = {};
  const owners = new Map<string, string>();

  for (const [path, area] of Object.entries(areas)) {
    const owner = areaName(path);

    for (const [name, hook] of Object.entries(area(studio))) {
      const taken = owners.get(name);

      if (taken) throw new Error(`__studio.${name} is defined in both ${taken} and ${owner}`);

      owners.set(name, owner);
      hooks[name] = hook;
    }
  }

  return hooks;
}
