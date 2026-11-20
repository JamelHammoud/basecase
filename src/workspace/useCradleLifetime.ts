import { useEffect, useEffectEvent, type RefObject } from 'react';
import type { CradleOptions } from './useAssemblyCradle';

export function useCradleLifetime(
  options: CradleOptions,
  controller: RefObject<AbortController | null>,
  faceRun: RefObject<number>,
) {
  const { docs, scene, buildAlong, active, parameters } = options;
  const closeTemporary = useEffectEvent(() => options.printing.closeTemporary());

  useEffect(
    () => () => {
      controller.current?.abort();
      faceRun.current++;
      closeTemporary();
    },
    [
      controller,
      faceRun,
      docs.parts,
      docs.project,
      scene.sceneId,
      buildAlong.index,
      buildAlong.sessionId,
      buildAlong.active,
      active,
      parameters.status.state,
    ],
  );
}
