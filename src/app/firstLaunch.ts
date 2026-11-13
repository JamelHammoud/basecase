import { bundleScene, parseGalleryBundle, type GalleryBundle } from '../gallery/galleryBundle';
import type { WorkspaceSeed } from '../workspace/types';
import { newSceneId } from '../utils/sceneIds';

export const FIRST_ROBOT = 'rover-reach-the-flag';

export function seedFromBundle(bundle: GalleryBundle): WorkspaceSeed {
  const scene = bundleScene(bundle);

  return {
    sceneId: newSceneId(),
    sceneName: scene.name,
    globalGoal: scene.globalGoal,
    parts: scene.parts,
    annotations: scene.annotations,
    project: scene.project,
    playCase: bundle.case.id,
  };
}

export async function firstRobotSeed(): Promise<WorkspaceSeed | null> {
  try {
    const response = await fetch(`/gallery/${FIRST_ROBOT}.json`);

    return response.ok ? seedFromBundle(parseGalleryBundle(await response.json())) : null;
  } catch {
    return null;
  }
}
