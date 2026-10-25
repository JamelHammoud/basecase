export interface Spring {
  response: number;
  damping: number;
}

export interface SpringTiming {
  duration: number;
  easing: string;
}

const SAMPLES = 60;
const SETTLE = 0.001;

function springAt(spring: Spring, t: number): number {
  const omega = (2 * Math.PI) / spring.response;
  const zeta = spring.damping;

  if (zeta >= 1) return 1 - (1 + omega * t) * Math.exp(-omega * t);

  const damped = omega * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * omega * t);

  return 1 - decay * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t));
}

function settleTime(spring: Spring): number {
  const omega = (2 * Math.PI) / spring.response;

  return -Math.log(SETTLE) / (Math.min(spring.damping, 1) * omega);
}

const cache = new Map<string, SpringTiming>();

export function springTiming(spring: Spring): SpringTiming {
  const key = `${spring.response}|${spring.damping}`;
  const known = cache.get(key);

  if (known) return known;

  const seconds = settleTime(spring);
  const points = Array.from({ length: SAMPLES + 1 }, (_, i) => springAt(spring, (seconds * i) / SAMPLES).toFixed(4));

  points[SAMPLES] = '1';

  const timing = { duration: Math.round(seconds * 1000), easing: `linear(${points.join(', ')})` };

  cache.set(key, timing);

  return timing;
}
