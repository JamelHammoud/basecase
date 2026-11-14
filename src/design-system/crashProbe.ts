import { useSyncExternalStore } from 'react';

let crashing: string | null = null;

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const current = () => crashing;

export function crashRegion(region: string | null) {
  crashing = region;
  listeners.forEach((listener) => listener());
}

export function CrashProbe({ region }: { region: string }) {
  const target = useSyncExternalStore(subscribe, current, current);

  if (target === region) throw new Error(`Test crash in ${region}`);

  return null;
}
