const BATCH = 'loop/batch/';

export const isBatch = (pull) => pull.headRefName.startsWith(BATCH);

export function landStep({ repair, conflicting, revising, review, quick, full, dispatched }) {
  if (conflicting || revising || review !== 'success') return 'wait';

  if (repair) return quick === 'success' ? 'merge' : 'wait';

  if (full === 'success') return 'merge';

  if (full === 'failure' || full === 'cancelled' || full === 'timed_out') return 'wait';

  if (full === 'pending' || dispatched) return 'wait';

  return quick === 'success' ? 'start full' : 'wait';
}
