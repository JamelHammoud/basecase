import { store } from './store.mjs';

const BASE_WAIT_MS = 30 * 60 * 1000;
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;

const steps = store('steps', { declines: 0, until: 0, waitFor: [] });

export const stepEntry = steps.get;

export const recordDecline = (number, { now, waitFor, inputSignature, missing = [] }) =>
  steps.update(number, (entry) => ({
    declines: entry.declines + 1,
    until: now + Math.min(MAX_WAIT_MS, BASE_WAIT_MS * 2 ** entry.declines),
    waitFor,
    inputSignature,
    missing,
  }));

export function stepWaiting(entry, { now, openNumbers, inputSignature }) {
  if (entry.waitFor.some((number) => openNumbers.has(number))) return true;

  if (entry.inputSignature && inputSignature && entry.inputSignature !== inputSignature) return false;

  if (entry.inputSignature && inputSignature === entry.inputSignature) return entry.waitFor.length === 0;

  return now < entry.until;
}
