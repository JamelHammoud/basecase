import { useSyncExternalStore } from 'react';

let open: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export function setPowerReplayOpen(value: string | null) {
  open = value;
  listeners.forEach((listener) => listener());
}

export const usePowerReplayOpen = (sceneId: string) => useSyncExternalStore(subscribe, () => open === sceneId);
