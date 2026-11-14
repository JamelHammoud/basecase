import { negative } from '../../electron/minus.mjs';

const tenths = (mm: number) => Math.round(mm * 10) / 10;

export function lengthFigure(mm: number): string {
  const v = Math.max(0, mm);

  if (v > 0 && v < 0.05) return String(Math.max(0.01, Math.round(v * 100) / 100));

  return tenths(v) < 100 ? String(tenths(v)) : String(Math.round(v));
}

function metres(m: number): string {
  if (m < 9.995) return `${m.toFixed(2)} m`;

  return m < 99.95 ? `${m.toFixed(1)} m` : `${Math.round(m)} m`;
}

export function lengthLabel(mm: number): string {
  const v = Math.max(0, mm);

  return Math.round(v) < 1000 ? `${lengthFigure(v)} mm` : metres(Math.round(v) / 1000);
}

export const signedLengthLabel = (mm: number): string => negative(mm, lengthLabel);

export const sizeFigures = (mm: readonly number[]): string => mm.map(lengthFigure).join(' × ');

export const sizeLabel = (mm: readonly number[]): string => `${sizeFigures(mm)} mm`;
