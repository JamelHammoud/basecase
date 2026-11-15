import { fileURLToPath } from 'node:url';
import { claim } from './claim.mjs';
import { overflowAvailable } from './agentPolicy.mjs';
import { store } from './store.mjs';
import { run } from './sh.mjs';

const quotas = store('quota', { at: 0, windows: [], baseline: null });
const queryFile = fileURLToPath(new URL('../quota-query.mjs', import.meta.url));

export function quotaSnapshot(provider, { refresh = false } = {}) {
  const previous = quotas.get(provider);

  if (!refresh && Date.now() - previous.at < 60_000) return previous;

  const release = claim(`quota-${provider}`);

  if (!release) return previous;

  try {
    const response = run(process.execPath, [queryFile, provider], { timeout: 20_000, allowFail: true });

    if (!response.ok) return previous;

    const snapshot = JSON.parse(response.out);

    return quotas.save(provider, { ...previous, ...snapshot });
  } catch {
    return previous;
  } finally {
    release();
  }
}

export function reserveOverflow() {
  const release = claim('claude-overflow');

  if (!release) return null;

  const used = quotaSnapshot('claude', { refresh: true });

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
