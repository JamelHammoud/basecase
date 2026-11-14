export const MINUS = '−';

const showsAny = (figures) => /[1-9]/.test(figures);

export function negative(value, figures) {
  const shown = figures(Math.abs(value));

  return `${value < 0 && showsAny(shown) ? MINUS : ''}${shown}`;
}

export function signed(value, figures) {
  const shown = figures(Math.abs(value));

  return `${value < 0 && showsAny(shown) ? MINUS : '+'}${shown}`;
}
