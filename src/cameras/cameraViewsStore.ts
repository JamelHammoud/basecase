import { useSyncExternalStore } from 'react';

interface CameraViewsState {
  expanded: boolean;
  enlarged: string | null;
}

let state: CameraViewsState = { expanded: true, enlarged: null };
const listeners = new Set<() => void>();

const set = (next: Partial<CameraViewsState>) => {
  state = { ...state, ...next };
  listeners.forEach((notify) => notify());
};

const subscribe = (notify: () => void) => {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
};

export const cameraViewsExpanded = () => state.expanded;

export const toggleCameraViews = () => set({ expanded: !state.expanded });

export const expandCameraViews = () => set({ expanded: true });

export const enlargeCameraView = (key: string | null) => set({ enlarged: state.enlarged === key ? null : key });

export const useCameraViewsState = () => useSyncExternalStore(subscribe, () => state);
