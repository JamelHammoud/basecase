import { fileURLToPath } from 'node:url';
import { claim } from './claim.mjs';
import { overflowAvailable } from './agentPolicy.mjs';
import { store } from './store.mjs';
import { run } from './sh.mjs';

const quotas = store('quota', { at: 0, windows: [], baseline: null });
const queryFile = fileURLToPath(new URL('../quota-query.mjs', import.meta.url));
const recentlyChecked = (snapshot) => Date.now() - Math.max(snapshot.at, snapshot.checkedAt ?? 0) < 60_000;

export function quotaSnapshot(provider, { refresh = false } = {}) {
  const previous = quotas.get(provider);

  if (!refresh && recentlyChecked(previous)) return previous;

  const release = claim(`quota-${provider}`);

  if (!release) return previous;

  try {
    const current = quotas.get(provider);

    if (!refresh && recentlyChecked(current)) return current;

    const attempted = quotas.save(provider, { ...current, checkedAt: Date.now() });
    const response = run(process.execPath, [queryFile, provider], { timeout: 20_000, allowFail: true });

    if (!response.ok) return attempted;

    const snapshot = JSON.parse(response.out);

    if (!Array.isArray(snapshot.windows) || snapshot.windows.length === 0) return attempted;

    return quotas.save(provider, { ...attempted, ...snapshot });
  } catch {
    return quotas.get(provider);
  } finally {
    release();
  }
}

export function reserveOverflow() {
  const release = claim('claude-overflow');

  if (!release) return null;

  const used = quotaSnapshot('claude');

  if (!overflowAvailable({ used, baseline: used.baseline })) {
    release();

    return null;
  }

  const weekly = used.windows.find((window) => window.minutes === 10080);

  if (!used.baseline || used.baseline.reset !== weekly.reset)
    quotas.save('claude', { ...used, baseline: { used: weekly.used, reset: weekly.reset } });

  return () => {
    quotaSnapshot('claude', { refresh: true });
    release();
  };
}

export const quotaState = (provider) => quotas.get(provider);
