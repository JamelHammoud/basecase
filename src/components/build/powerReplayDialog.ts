import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export function setPowerReplayOpen(value: boolean) {
  open = value;
  listeners.forEach((listener) => listener());
}

export const usePowerReplayOpen = () => useSyncExternalStore(subscribe, () => open);
