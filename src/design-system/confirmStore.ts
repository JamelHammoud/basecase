import type React from 'react';

export interface ConfirmRequest {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
}

let pending: ConfirmRequest | null = null;
const listeners = new Set<() => void>();

export const setConfirmRequest = (next: ConfirmRequest | null) => {
  pending = next;
  listeners.forEach((notify) => notify());
};

export const confirmAction = (request: ConfirmRequest) => setConfirmRequest(request);

export const subscribeConfirm = (notify: () => void) => {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
};

export const currentConfirm = () => pending;
