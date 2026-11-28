const GATE_JOB = 'check';

export function repairPlan({ failed, taken, repairOpen }) {
  const unseen = failed.filter((name) => !taken.includes(name));
  const left = taken.length > 0 ? unseen.filter((name) => name !== GATE_JOB) : unseen;

  if (left.length === 0) return { wait: 'every failed job in the last Check has had a repair' };

  if (repairOpen()) return { wait: 'a repair pull request is already open' };

  return { jobs: left };
}
