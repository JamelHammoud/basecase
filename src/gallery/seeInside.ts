import { readStored, writeStored } from '../app/storedSettings';
import { saveScene } from '../utils/platform/web/webScenes';
import { bundleScene, type GalleryBundle } from './galleryBundle';

const OPEN_SCENES = 'open-scenes';

export async function seeInside(bundle: GalleryBundle): Promise<void> {
  const saved = await saveScene({ id: `gallery-${bundle.slug}`, ...bundleScene(bundle) });
  const open = (readStored(OPEN_SCENES) as { ids?: string[]; tabIds?: string[] } | null) ?? {};
  const ids = [saved?.id ?? `gallery-${bundle.slug}`, ...(open.ids ?? []).filter((id) => id !== saved?.id)];

  writeStored(OPEN_SCENES, { ids, tabIds: [], active: 0 });
  location.assign('/');
}
