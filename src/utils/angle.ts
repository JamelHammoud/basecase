import { negative, signed } from '../../electron/minus.mjs';

const tenths = (deg: number) => Math.round(deg * 10) / 10;

function magnitude(deg: number): string {
  if (deg > 0 && deg < 0.05) return String(Math.max(0.01, Math.round(deg * 100) / 100));

  return tenths(deg) < 10 ? String(tenths(deg)) : String(Math.round(deg));
}

export const angle = (deg: number): string => `${negative(deg, magnitude)}°`;

export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

export const angleFromRadians = (radians: number) => angle(radiansToDegrees(radians));

const tenthsFigure = (deg: number) => deg.toFixed(1);

export const readingFigure = (deg: number): string => negative(deg, tenthsFigure);

export const angleReading = (deg: number) => `${readingFigure(deg)}°`;

export const signedAngleReading = (deg: number): string => `${signed(deg, tenthsFigure)}°`;
