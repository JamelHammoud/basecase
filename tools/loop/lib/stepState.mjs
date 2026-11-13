import { store } from './store.mjs';

const BASE_WAIT_MS = 30 * 60 * 1000;
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;

const steps = store('steps', { declines: 0, until: 0, waitFor: [] });

export const stepEntry = steps.get;

export const recordDecline = (number, { now, waitFor }) =>
  steps.update(number, (entry) => ({
    declines: entry.declines + 1,
    until: now + Math.min(MAX_WAIT_MS, BASE_WAIT_MS * 2 ** entry.declines),
    waitFor,
  }));

export const stepWaiting = (entry, { now, openNumbers }) =>
  now < entry.until || entry.waitFor.some((number) => openNumbers.has(number));
