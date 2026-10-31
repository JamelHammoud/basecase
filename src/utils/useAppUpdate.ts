import { useSyncExternalStore } from 'react';
import type { AppUpdateState } from './platform/types';

const NO_UPDATE: AppUpdateState = { stage: 'none', version: '' };
const listeners = new Set<() => void>();

let state = NO_UPDATE;
let watching = false;

function put(next: AppUpdateState) {
  state = next;

  for (const listener of listeners) listener();
}

function watch() {
  const api = window.electronAPI;

  if (watching || !api) return;

  watching = true;
  api.onUpdateState(put);
  void api.updateState().then(put);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  watch();

  return () => {
    listeners.delete(listener);
  };
}

export function useAppUpdate(): AppUpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

export function installUpdate() {
  void window.electronAPI?.installUpdate();
}
