function figures(value: number): string {
  const v = Math.max(0, value);

  if (v > 0 && v < 0.05) return String(Math.max(0.01, Math.round(v * 100) / 100));

  return v < 99.95 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
}

export const volts = (v: number) => `${figures(v)} V`;

export const amps = (a: number) => `${figures(a)} A`;
