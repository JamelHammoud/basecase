const IDLE_TIMEOUT_MS = 2000;

export function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'undefined') {
    const timer = setTimeout(run, 0);

    return () => clearTimeout(timer);
  }

  const handle = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });

  return () => cancelIdleCallback(handle);
}
