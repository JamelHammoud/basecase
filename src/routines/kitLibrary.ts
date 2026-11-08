import type { Skill } from '../skills/artifacts';

const KIT_FILES = import.meta.glob('./kit/*.skill.json', { import: 'default' }) as Record<string, () => Promise<Skill>>;

export async function loadKitLibrary(): Promise<Skill[]> {
  const loaders = Object.entries(KIT_FILES).sort(([a], [b]) => a.localeCompare(b));

  return Promise.all(loaders.map(([, load]) => load()));
}
