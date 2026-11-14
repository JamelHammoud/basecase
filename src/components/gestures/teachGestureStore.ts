import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  open = next;
  listeners.forEach((notify) => notify());
}

export const TEACH_GESTURE = 'Teach Gesture';

export const openTeachGesture = () => set(true);

export const closeTeachGesture = () => set(false);

const subscribe = (notify: () => void) => {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
};

export const useTeachGestureOpen = () => useSyncExternalStore(subscribe, () => open);
