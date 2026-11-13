import { useSyncExternalStore } from 'react';

export interface OperatorState {
  on: boolean;
  label: string;
  failure: { message: string; at: number } | null;
}

let state: OperatorState = { on: false, label: '', failure: null };
const listeners = new Set<() => void>();

export const operatorState = () => state;

export function setOperatorState(patch: Partial<OperatorState>) {
  state = { ...state, ...patch };
  listeners.forEach((listen) => listen());
}

export function subscribeOperator(listen: () => void) {
  listeners.add(listen);

  return () => {
    listeners.delete(listen);
  };
}

export const useOperatorCamera = () => useSyncExternalStore(subscribeOperator, operatorState, operatorState);
