export interface StateSpan {
  from: number;
  to: number;
  value: string;
}

export function stateSpans(t: ArrayLike<number>, values: ArrayLike<string>, end: number): StateSpan[] {
  const spans: StateSpan[] = [];

  for (let i = 0; i < t.length; i++) {
    const value = values[i];
    const open = spans.at(-1);

    if (open) open.to = t[i];

    if (value === '' || open?.value === value) continue;

    spans.push({ from: t[i], to: t[i], value });
  }

  const last = spans.at(-1);

  if (last) last.to = Math.max(last.to, end);

  return spans.filter((s, i) => s.to > s.from || i === spans.length - 1);
}

export const numberLabel = (value: number) =>
  Number.isFinite(value) ? String(Number.isInteger(value) ? value : Number(value.toPrecision(6))) : '';

export const stateValues = (sorted: readonly StateSpan[]) => [...new Set(sorted.map((s) => s.value))];
