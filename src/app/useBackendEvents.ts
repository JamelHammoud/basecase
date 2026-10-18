import { useEffect, useEffectEvent, type Dispatch, type SetStateAction } from 'react';
import type { AcpStatusInfo, CustomModelDefinition, SavedSceneSummary } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';

type BackendEvent = Record<string, unknown>;

export interface BackendEventTargets {
  setAcpStatus: Dispatch<SetStateAction<AcpStatusInfo>>;
  setCustomModels: Dispatch<SetStateAction<CustomModelDefinition[]>>;
  setSavedScenes: Dispatch<SetStateAction<SavedSceneSummary[]>>;
  routeToScene: (event: BackendEvent) => void;
}

function appEventHandlers({ setAcpStatus, setCustomModels, setSavedScenes }: BackendEventTargets) {
  const applyModels = (event: BackendEvent) => {
    if (Array.isArray(event.models)) setCustomModels(event.models as CustomModelDefinition[]);
  };
  const applyScenes = (event: BackendEvent) => {
    if (Array.isArray(event.scenes)) setSavedScenes(event.scenes as SavedSceneSummary[]);
  };

  return new Map<unknown, (event: BackendEvent) => void>([
    [
      'acp-status',
      (event) => {
        if (event.status) setAcpStatus(event.status as AcpStatusInfo);
      },
    ],
    ['library-models-changed', applyModels],
    ['library-scenes-changed', applyScenes],
    [
      'acp-file-written',
      (event) => {
        applyModels(event);
        applyScenes(event);
      },
    ],
  ]);
}

export function useBackendEvents(targets: BackendEventTargets) {
  const onEvent = useEffectEvent((event: BackendEvent) => {
    const apply = appEventHandlers(targets).get(event.type);

    if (apply) apply(event);
    else targets.routeToScene(event);
  });

  useEffect(() => platformBridge.subscribeEvents((event) => onEvent(event)), []);
}
