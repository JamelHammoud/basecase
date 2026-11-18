import { availableCapabilities } from './capabilities.mjs';
import { store } from './store.mjs';

const BASE_WAIT_MS = 30 * 60 * 1000;
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;

const steps = store('steps', { declines: 0, until: 0, waitFor: [] });

export const stepEntry = steps.get;

export const recordDecline = (number, { now, waitFor, inputSignature, taskHead, missing = [] }) =>
  steps.update(number, (entry) => ({
    declines: entry.declines + 1,
    until: now + Math.min(MAX_WAIT_MS, BASE_WAIT_MS * 2 ** entry.declines),
    waitFor,
    inputSignature,
    taskHead,
    missing,
  }));

const definitionChanged = (entry, head) => Boolean(entry.taskHead && head && entry.taskHead !== head);
const knownMissing = (entry, head) => (entry.taskHead && entry.taskHead === head ? (entry.missing ?? []) : []);

export function stepWaiting(
  entry,
  { now, openNumbers, inputSignature, taskHead, available = availableCapabilities() },
) {
  if (definitionChanged(entry, taskHead)) return false;

  const missing = knownMissing(entry, taskHead);

  if (missing.some((capability) => !available.includes(capability))) return true;

  if (entry.waitFor.some((number) => openNumbers.has(number))) return true;

  if (missing.length > 0 || entry.waitFor.length > 0) return false;

  if (entry.inputSignature && inputSignature && entry.inputSignature !== inputSignature) return false;

  if (entry.inputSignature && inputSignature === entry.inputSignature) return true;

  return now < entry.until;
}
