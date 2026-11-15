export function mergeJoints<T extends { id: string }>(previous: T[], made: T[], replace = false): T[] {
  if (replace || !previous.length) return [...made];

  if (!made.length) return [...previous];

  const ids = new Set(made.map((j) => j.id));
  const kept = previous.filter((j) => !ids.has(j.id));

  return [...kept, ...made];
}
