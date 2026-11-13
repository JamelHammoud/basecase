import { store } from './store.mjs';

const pulls = store('pulls', {
  heads: [],
  attempts: 0,
  lastJamel: '',
  lastLook: '',
  conflictFails: 0,
  refreshed: [],
  rebuilt: false,
});

export const entryFor = pulls.get;

export const saveEntry = pulls.save;

export const markLooked = (number, at) => pulls.update(number, () => ({ lastLook: at }));

export const markRebuilt = (number) => pulls.update(number, () => ({ rebuilt: true }));

export const markRefreshed = (number, head) =>
  pulls.update(number, (entry) => ({ refreshed: [...entry.refreshed, head].slice(-20) }));

export const nudge = (number, head) =>
  pulls.update(number, (entry) => ({
    heads: entry.heads.filter((seen) => seen !== head),
    refreshed: entry.refreshed.filter((seen) => seen !== head),
  }));

export const recordConflictFail = (number) =>
  pulls.update(number, (entry) => ({ conflictFails: entry.conflictFails + 1 })).conflictFails;

export const recordAttempt = (number, { head, jamelAt }) =>
  pulls.update(number, (entry) => ({
    heads: [...new Set([...entry.heads, head])].slice(-20),
    attempts: entry.attempts + 1,
    lastJamel: jamelAt || entry.lastJamel,
  }));
