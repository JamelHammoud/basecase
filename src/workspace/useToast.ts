import { useRef, useState } from 'react';
import { settingsPaneIn, type SettingsPane } from '../app/settingsPanes';
import type { ToastData } from '../design-system';
import type { ToastOptions } from './types';

const ACTION_TOAST_MS = 5000;
const TOAST_MS = 2800;

const withSettingsAction = (message: string, opts: ToastOptions, openSettings: (pane: SettingsPane) => void) => {
  const pane = opts.action ? null : settingsPaneIn(message);

  return pane ? { ...opts, action: { label: 'Open', onClick: () => openSettings(pane) } } : opts;
};

export function useToast(openSettings: (pane: SettingsPane) => void) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastId = useRef(0);

  const showToast = (message: string, given: ToastOptions = {}) => {
    const opts = withSettingsAction(message, given, openSettings);

    if (timerRef.current) window.clearTimeout(timerRef.current);

    const id = Math.max(Date.now(), lastId.current + 1);

    lastId.current = id;
    setToast({ id, message, ...opts });

    if (opts.tone === 'progress') return id;

    timerRef.current = window.setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      opts.action ? ACTION_TOAST_MS : TOAST_MS,
    );

    return id;
  };

  const dismissToast = (id?: number) =>
    setToast((current) => (typeof id !== 'number' || current?.id === id ? null : current));

  return { toast, showToast, dismissToast };
}
