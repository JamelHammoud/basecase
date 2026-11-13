import type { StrengthReading, StressField } from './types';

const fields = new Map<string, StressField>();
const listeners = new Set<() => void>();
let shown: string[] = [];

const notify = () => listeners.forEach((listener) => listener());

export function rememberStress(readings: Array<StrengthReading | null>): void {
  const worst = new Map<string, StrengthReading>();

  for (const r of readings) {
    if (!r) continue;

    const known = worst.get(r.part);

    if (!known || r.factor < known.factor) worst.set(r.part, r);
  }

  worst.forEach((r, part) => fields.set(part, r.field));
  notify();
}

export function showStress(ids: string[]): () => void {
  shown = ids;
  notify();

  return () => {
    if (shown !== ids) return;

    shown = [];
    notify();
  };
}

export const shownStress = () => shown;

export const stressFieldOf = (part: string): StressField | undefined => fields.get(part);

export function onStressFields(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}
