const pad = (n: number) => String(n).padStart(2, '0');

export const runClock = (seconds: number) => `${seconds.toFixed(1)} s`;

const shortSpan = (seconds: number) =>
  seconds > 0 && seconds < 0.095 ? Math.max(0.01, Math.round(seconds * 100) / 100) : Math.round(seconds * 10) / 10;

function wholeSeconds(seconds: number, smallest: 's' | 'min') {
  if (smallest === 'min') return Math.max(1, Math.round(seconds / 60)) * 60;

  const whole = Math.round(seconds);

  return whole >= 3600 ? Math.round(whole / 60) * 60 : whole;
}

export function duration(seconds: number, smallest: 's' | 'min' = 's'): string {
  const short = shortSpan(Math.max(0, seconds));

  if (smallest === 's' && short < 60) return `${short} s`;

  const whole = wholeSeconds(seconds, smallest);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;

  if (hours) return `${hours} h ${pad(minutes)} min`;

  return rest ? `${minutes} min ${pad(rest)} s` : `${minutes} min`;
}
