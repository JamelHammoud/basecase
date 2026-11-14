const MINUS = '−';

const tenths = (deg: number) => Math.round(deg * 10) / 10;

function magnitude(deg: number): string {
  if (deg > 0 && deg < 0.05) return String(Math.max(0.01, Math.round(deg * 100) / 100));

  return tenths(deg) < 10 ? String(tenths(deg)) : String(Math.round(deg));
}

export function angle(deg: number): string {
  const text = magnitude(Math.abs(deg));

  return `${deg < 0 && text !== '0' ? MINUS : ''}${text}°`;
}

export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

export const angleFromRadians = (radians: number) => angle(radiansToDegrees(radians));

export function readingFigure(deg: number): string {
  const text = Math.abs(deg).toFixed(1);

  return `${deg < 0 && text !== '0.0' ? MINUS : ''}${text}`;
}

export const angleReading = (deg: number) => `${readingFigure(deg)}°`;

export function signedAngleReading(deg: number): string {
  const text = readingFigure(deg);

  return `${text.startsWith(MINUS) ? '' : '+'}${text}°`;
}
