const GENERATED_FIELDS = new Set(['bodyEvidence', 'buildGuide']);

export function sameProjectInputs(before: object, now: object): boolean {
  if (before === now) return true;

  const keys = new Set([...Object.keys(before), ...Object.keys(now)]);

  return [...keys].every((key) => GENERATED_FIELDS.has(key) || Reflect.get(before, key) === Reflect.get(now, key));
}

export function sameProjectSnapshot(before: object, now: object): boolean {
  if (before === now) return true;

  const generatedChanged = [...GENERATED_FIELDS].some((key) => Reflect.get(before, key) !== Reflect.get(now, key));

  return generatedChanged && sameProjectInputs(before, now);
}
