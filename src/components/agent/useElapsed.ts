import { useEffect, useState } from 'react';
import { duration } from '../../utils/duration';

const SHOWN_AFTER_S = 3;

export function useElapsed(since: string | undefined, active: boolean) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!active) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [active]);

  const start = since ? Date.parse(since) : NaN;

  if (!active || !now || Number.isNaN(start)) return '';

  const seconds = Math.max(0, Math.floor((now - start) / 1000));

  return seconds < SHOWN_AFTER_S ? '' : duration(seconds);
}
