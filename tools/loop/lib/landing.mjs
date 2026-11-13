const BATCH = 'loop/batch/';

export const isBatch = (pull) => pull.headRefName.startsWith(BATCH);

export const ready = ({ conflicting, revising, review, check }) =>
  !conflicting && !revising && review === 'success' && check === 'success';
