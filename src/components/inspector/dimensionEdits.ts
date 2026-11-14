export interface DimensionEdits {
  code: string;
  values: Record<string, number>;
}

interface Edit {
  code: string;
  name: string;
  value: number;
  was: number;
}

export const noEdits = (code: string): DimensionEdits => ({ code, values: {} });

export const seenAt = (edits: DimensionEdits, code: string) => (edits.code === code ? edits : noEdits(code));

export const shownValue = (edits: DimensionEdits, name: string, fromCode: number) => edits.values[name] ?? fromCode;

export function withEdit(edits: DimensionEdits, { code, name, value, was }: Edit): DimensionEdits | null {
  const current = seenAt(edits, code);

  if (value === shownValue(current, name, was)) return null;

  return { code, values: { ...current.values, [name]: value } };
}

export const settled = (edits: DimensionEdits, sent: DimensionEdits) => (edits === sent ? noEdits(edits.code) : edits);
