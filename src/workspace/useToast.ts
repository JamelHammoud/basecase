import { useRef, useState } from 'react';
import { settingsPaneIn, type SettingsPane } from '../app/settingsPanes';
import type { ToastData } from '../design-system';
import type { ShowToast, ToastOptions } from './types';

const ACTION_TOAST_MS = 5000;
const TOAST_MS = 2800;

const withSettingsAction = (message: string, opts: ToastOptions, openSettings: (pane: SettingsPane) => void) => {
  const pane = opts.action ? null : settingsPaneIn(message);

  return pane ? { ...opts, action: { label: 'Open', onClick: () => openSettings(pane) } } : opts;
};

export function useToast(openSettings: (pane: SettingsPane) => void) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timerRef = useRef<number | null>(null);

  const showToast: ShowToast = (message, given = {}) => {
    const opts = withSettingsAction(message, given, openSettings);

    if (timerRef.current) window.clearTimeout(timerRef.current);

    const id = Date.now();

    setToast({ id, message, ...opts });

    if (opts.tone === 'progress') return;

    timerRef.current = window.setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      opts.action ? ACTION_TOAST_MS : TOAST_MS,
    );
  };

  const dismissToast = () => setToast(null);

  return { toast, showToast, dismissToast };
}
