const tenths = (grams: number) => Math.round(grams * 10) / 10;

function kilograms(kg: number): string {
  if (kg < 9.995) return `${kg.toFixed(2)} kg`;

  return kg < 99.95 ? `${kg.toFixed(1)} kg` : `${Math.round(kg)} kg`;
}

export function weight(grams: number): string {
  const g = Math.max(0, grams);

  if (g > 0 && g < 0.05) return `${Math.max(0.01, Math.round(g * 100) / 100)} g`;

  if (tenths(g) < 10) return `${tenths(g)} g`;

  const whole = Math.round(g);

  return whole < 1000 ? `${whole} g` : kilograms(whole / 1000);
}
