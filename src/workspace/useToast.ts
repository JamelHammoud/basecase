import { useRef, useState } from 'react';
import type { ToastData } from '../design-system';
import type { ShowToast } from './types';

const ACTION_TOAST_MS = 5000;
const TOAST_MS = 2800;

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timerRef = useRef<number | null>(null);

  const showToast: ShowToast = (message, opts = {}) => {
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
