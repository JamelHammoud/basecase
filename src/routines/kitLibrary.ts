import type { Skill } from '../skills/artifacts';

const KIT_FILES = import.meta.glob<Skill>('./kit/*.json', { import: 'default' });

export async function loadKitLibrary(): Promise<Skill[]> {
  const loaders = Object.entries(KIT_FILES).sort(([a], [b]) => a.localeCompare(b));

  return Promise.all(loaders.map(([, load]) => load()));
}
