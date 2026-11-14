const GATE_JOB = 'check';

export function repairPlan({ run, failed, taken, repairMerged, repairOpen }) {
  const unseen = failed.filter((name) => !taken.includes(name));
  const left = taken.length > 0 ? unseen.filter((name) => name !== GATE_JOB) : unseen;

  if (left.length === 0) return { wait: 'every failed job in the last Check has had a repair' };

  if (taken.length > 0) {
    return run.status === 'completed'
      ? { jobs: left }
      : { wait: 'waiting for Check to finish before repairing the jobs the last repair never saw' };
  }

  if (repairMerged())
    return { wait: 'a repair merged after the last failed Check; waiting for Check on the newer main' };

  if (repairOpen()) return { wait: 'a repair pull request is already open' };

  return { jobs: left };
}
