import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => open;

export function setSupplierOffersOpen(value: boolean) {
  open = value;
  listeners.forEach((listener) => listener());
}

export const useSupplierOffersOpen = () => useSyncExternalStore(subscribe, snapshot);
