import { readStored, writeStored } from '../app/storedSettings';
import { saveScene } from '../utils/platform/web/webScenes';
import { keepPolicy, keepSkill } from '../utils/platform/web/webTrained';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import type { GalleryBundle } from './galleryBundle';
import type { GalleryTrained } from './galleryTrained';

const OPEN_SCENES = 'open-scenes';

async function keepTrained(trained: GalleryTrained | undefined): Promise<Partial<ProjectSettings>> {
  if (trained?.kind === 'policy') {
    await keepPolicy(trained.record.id, trained.spec);

    return { policies: [trained.record] };
  }

  if (trained?.kind === 'skill') {
    await keepSkill(trained.record.hash, trained.skill);

    return { skills: [trained.record] };
  }

  return {};
}

export async function seeInside(bundle: GalleryBundle): Promise<void> {
  const trained = await keepTrained(bundle.trained);
  const saved = await saveScene({
    id: `gallery-${bundle.slug}`,
    name: bundle.title,
    globalGoal: '',
    parts: bundle.robot.parts,
    annotations: [],
    project: { ...DEFAULT_PROJECT, joints: bundle.robot.joints, cases: [bundle.case], ...trained },
  } as Parameters<typeof saveScene>[0]);
  const open = (readStored(OPEN_SCENES) as { ids?: string[]; tabIds?: string[] } | null) ?? {};
  const ids = [saved?.id ?? `gallery-${bundle.slug}`, ...(open.ids ?? []).filter((id) => id !== saved?.id)];

  writeStored(OPEN_SCENES, { ids, tabIds: [], active: 0 });
  location.assign('/');
}
