import type { RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ShowToast } from './types';
import { useBuildAlong } from './useBuildAlong';
import { useBuildGuide } from './useBuildGuide';
import type { SceneDocument } from './useSceneDocument';

interface SceneGuideOptions {
  sceneName: string;
  docs: SceneDocument;
  showToast: ShowToast;
  viewportRef: RefObject<Viewport3DHandle | null>;
}

export function useSceneGuide({ sceneName, docs, showToast, viewportRef }: SceneGuideOptions) {
  const { parts, project, partsRef, projectRef, updateProjectNow } = docs;
  const guide = useBuildGuide({
    sceneName,
    parts,
    project,
    partsRef,
    projectRef,
    updateProjectNow,
    showToast,
    viewportRef,
  });
  const buildAlong = useBuildAlong({ guide, projectRef, viewportRef });

  return { guide, buildAlong };
}
