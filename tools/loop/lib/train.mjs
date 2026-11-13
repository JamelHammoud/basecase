export const MAX_BATCH = 15;

export const afterFailure = (members) =>
  members.length === 1 ? { culprit: members[0], suspects: [] } : { culprit: null, suspects: members };

export function afterProbePassed(suspects, merged) {
  const remaining = suspects.filter((number) => !merged.includes(number));

  if (remaining.length === 1) return { culprit: remaining[0], suspects: [] };

  return { culprit: null, suspects: remaining };
}

export function probeMembers(suspects, ready) {
  const live = suspects.filter((number) => ready.includes(number));

  return live.slice(0, Math.max(1, Math.ceil(live.length / 2)));
}

export const freshMembers = (ready, suspects) =>
  ready.filter((number) => !suspects.includes(number)).slice(0, MAX_BATCH);
