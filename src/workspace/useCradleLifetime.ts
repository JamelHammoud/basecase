import { sameProjectSnapshot } from '../utils/projectInputs';
import { useProjectInputsChange } from './useProjectInputsChange';
import { useEffect, useEffectEvent, type RefObject } from 'react';
import type { CradleOptions } from './useAssemblyCradle';

export function useCradleLifetime(
  options: CradleOptions,
  controllerRef: RefObject<AbortController | null>,
  faceRunRef: RefObject<number>,
) {
  const { docs, scene, buildAlong, active, parameters } = options;
  const closeTemporary = useEffectEvent(() => options.printing.closeTemporary());

  useProjectInputsChange(
    docs.project,
    () => {
      controllerRef.current?.abort();
      faceRunRef.current++;
      options.printing.closeTemporary();
    },
    sameProjectSnapshot,
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      faceRunRef.current++;
      closeTemporary();
    },
    [
      controllerRef,
      faceRunRef,
      docs.parts,
      scene.sceneId,
      buildAlong.index,
      buildAlong.sessionId,
      buildAlong.active,
      active,
      parameters.status.state,
    ],
  );
}
