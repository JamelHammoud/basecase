const pad = (n: number) => String(n).padStart(2, '0');

export const runClock = (seconds: number) => `${seconds.toFixed(1)} s`;

export function duration(seconds: number, smallest: 's' | 'min' = 's'): string {
  const tenths = Math.round(Math.max(0, seconds) * 10) / 10;

  if (smallest === 's' && tenths < 60) return `${tenths} s`;

  const whole = smallest === 'min' ? Math.max(1, Math.round(seconds / 60)) * 60 : Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;

  if (hours) return `${hours} h ${pad(minutes)} min`;

  return rest ? `${minutes} min ${pad(rest)} s` : `${minutes} min`;
}
