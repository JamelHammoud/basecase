import { readStoredTry, type StoredTry, type TrySplit } from '../../cases/tryFile';
import { loadManifests } from '../../cases/tryStore';
import { sourceRun } from '../../datasets/snapshotSplits';
import type { FrameSet } from '../frameSet';

export interface PreparationSource {
  source: string;
  root: string;
  real: boolean;
  explicit?: TrySplit;
  manifests: StoredTry[];
}

async function sourceManifests(ids: string[], load: typeof loadManifests) {
  const found = new Map<string, StoredTry>();
  const requested = new Set<string>();
  let pending = [...new Set(ids)];

  for (let depth = 0; pending.length && depth < 100; depth++) {
    const loaded: StoredTry[] = [];

    for (let at = 0; at < pending.length; at += 500) loaded.push(...(await load(pending.slice(at, at + 500))));

    pending.forEach((id) => requested.add(id));

    for (const raw of loaded) {
      const manifest = readStoredTry(raw);

      if (!manifest || !requested.has(manifest.id)) throw new Error('Check the image source recording.');

      found.set(manifest.id, structuredClone(manifest));
    }

    pending = [
      ...new Set(
        loaded.flatMap((manifest) =>
          manifest.sourceTry && !requested.has(manifest.sourceTry) ? [manifest.sourceTry] : [],
        ),
      ),
    ];
  }

  if (pending.length) throw new Error('The image source chain is too long.');

  return found;
}

function ancestry(id: string, found: Map<string, StoredTry>): PreparationSource {
  const manifests: StoredTry[] = [];
  const seen = new Set<string>();
  let at: string | null = id;
  let explicit: TrySplit | undefined;

  while (at) {
    if (seen.has(at)) throw new Error('The image source chain has a cycle.');

    const manifest = found.get(at);

    if (!manifest) throw new Error('The dataset is missing an image source recording.');

    if (explicit && manifest.split && explicit !== manifest.split)
      throw new Error('The same source has conflicting dataset splits.');

    explicit ??= manifest.split;
    manifests.push(manifest);
    seen.add(at);
    at = manifest.sourceTry;
  }

  const root = manifests.at(-1)!;
  const scripted = root.input === 'script' && (root.source === 'case' || root.source === 'generated');

  return {
    source: `try:${id}`,
    root: scripted ? sourceRun(root.sceneId, root.case?.id ?? null, root.seed) : `try:${root.id}`,
    real: manifests.every((manifest) => ['real', 'operate', 'import'].includes(manifest.source)),
    ...(explicit ? { explicit } : {}),
    manifests,
  };
}

export async function preparationSources(sets: FrameSet[], load = loadManifests): Promise<PreparationSource[]> {
  const origins = sets.flatMap((set) => set.frames.flatMap((frame) => (frame.origin ? [frame.origin] : [])));
  const ids = [...new Set(origins.map((origin) => origin.tryId))];
  const found = await sourceManifests(ids, load);

  if (origins.some((origin) => origin.frame >= (found.get(origin.tryId)?.frames ?? 0)))
    throw new Error('The image source recording frame is missing.');

  return ids.map((id) => ancestry(id, found));
}
