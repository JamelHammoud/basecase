const WHOLE_EPSILON = 1e-9;

function figures(value) {
  if (value === 0) return 0;

  if (value < 0.5) return Math.max(0.1, Math.round(value * 10) / 10);

  if (value >= 99.5 && value < 100) return Math.min(99.9, Math.floor(value * 10) / 10);

  return Math.round(value);
}

export function percent(share, { down = false } = {}) {
  const value = Math.abs(share) * 100;
  const shown = down ? Math.floor(value + WHOLE_EPSILON) : figures(value);

  return `${share < 0 && shown > 0 ? '−' : ''}${shown}%`;
}
