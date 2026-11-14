import { negative } from '../../electron/minus.mjs';

const SMALLEST = 0.001;

function figures(nm: number): string {
  if (nm > 0 && nm < 0.005) return String(Math.max(SMALLEST, Math.round(nm * 1000) / 1000));

  if (nm < 9.995) return nm.toFixed(2);

  return nm < 99.95 ? nm.toFixed(1) : String(Math.round(nm));
}

export const torque = (nm: number): string => `${negative(nm, figures)} N·m`;
