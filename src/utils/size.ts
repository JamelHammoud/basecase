const tenths = (mm: number) => Math.round(mm * 10) / 10;

export function lengthFigure(mm: number): string {
  const v = Math.max(0, mm);

  if (v > 0 && v < 0.05) return String(Math.max(0.01, Math.round(v * 100) / 100));

  return tenths(v) < 100 ? String(tenths(v)) : String(Math.round(v));
}

export const sizeFigures = (mm: readonly number[]): string => mm.map(lengthFigure).join(' × ');

export const sizeLabel = (mm: readonly number[]): string => `${sizeFigures(mm)} mm`;
