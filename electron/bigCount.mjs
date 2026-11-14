const UNITS = [
  ['B', 1e9],
  ['M', 1e6],
  ['K', 1e3],
];

const figures = (value) => (value < 9.95 ? Math.round(value * 10) / 10 : Math.round(value));

export function bigFigures(n) {
  const whole = Math.max(0, Math.round(n));
  const unit = UNITS.find(([, size]) => whole >= size * 0.9995);

  return unit ? `${figures(whole / unit[1])}${unit[0]}` : String(whole);
}

export const bigCount = (n, one, many = `${one}s`) => `${bigFigures(n)} ${Math.round(n) === 1 ? one : many}`;
