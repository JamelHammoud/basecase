import { useEffect, useState } from 'react';

const SHOWN_AFTER_S = 3;

export function elapsedLabel(seconds: number) {
  if (seconds < SHOWN_AFTER_S) return '';

  const minutes = Math.floor(seconds / 60);

  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export function useElapsed(since: string | undefined, active: boolean) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!active) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [active]);

  const start = since ? Date.parse(since) : NaN;

  if (!active || !now || Number.isNaN(start)) return '';

  return elapsedLabel(Math.max(0, Math.floor((now - start) / 1000)));
}
