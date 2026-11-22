const GENERATED_FIELDS = new Set(['bodyEvidence', 'buildGuide']);

export function sameProjectInputs(
  before: object,
  now: object,
  generatedFields: ReadonlySet<string> = GENERATED_FIELDS,
): boolean {
  if (before === now) return true;

  const keys = new Set([...Object.keys(before), ...Object.keys(now)]);

  return [...keys].every((key) => generatedFields.has(key) || Reflect.get(before, key) === Reflect.get(now, key));
}

export function sameProjectSnapshot(
  before: object,
  now: object,
  generatedFields: ReadonlySet<string> = GENERATED_FIELDS,
): boolean {
  if (before === now) return true;

  const generatedChanged = [...generatedFields].some((key) => Reflect.get(before, key) !== Reflect.get(now, key));

  return generatedChanged && sameProjectInputs(before, now, generatedFields);
}
