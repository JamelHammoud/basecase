export type V3 = [number, number, number];

export const DRIVE_BARS = Object.freeze({
  armIdleMm: 3,
  armMoveMm: 20,
  armSettleMm: 5,
  groundIdleM: 0.02,
  groundMoveM: 0.1,
  roverBackM: 0.05,
  groundSettleM: 0.03,
  blurDriftM: 0.03,
  realtimeLow: 0.95,
  realtimeHigh: 1.05,
  windowLow: 0.9,
  realtimeSeconds: 10,
  handMatchMm: 1,
  galleryMoveMm: 20,
});

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: V3) => Math.hypot(...v);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface ArmPhases {
  start: V3;
  afterIdle: V3;
  afterForward: V3;
  afterBack: V3;
  afterRelease: V3;
  fell: boolean;
}

export function armProblems(p: ArmPhases): string[] {
  const idle = norm(sub(p.afterIdle, p.start));
  const forward = sub(p.afterForward, p.afterIdle);
  const back = sub(p.afterBack, p.afterForward);
  const settle = norm(sub(p.afterRelease, p.afterBack));
  const problems: string[] = [];

  if (idle > DRIVE_BARS.armIdleMm) problems.push(`the hand drifted ${idle.toFixed(1)} mm with no key held`);

  if (norm(forward) < DRIVE_BARS.armMoveMm) problems.push(`W moved the hand ${norm(forward).toFixed(1)} mm`);

  if (norm(back) < DRIVE_BARS.armMoveMm) problems.push(`S moved the hand ${norm(back).toFixed(1)} mm`);

  if (dot(forward, back) >= 0) problems.push('S did not move the hand back against W');

  if (settle > DRIVE_BARS.armSettleMm) problems.push(`the hand kept moving ${settle.toFixed(1)} mm after release`);

  if (p.fell) problems.push('the arm fell');

  return problems;
}

export interface GroundPhases {
  start: number;
  afterIdle: number;
  afterForward: number;
  afterBack?: number;
  afterRelease: number;
  fell: boolean;
}

export function groundProblems(p: GroundPhases): string[] {
  const idle = Math.abs(p.afterIdle - p.start);
  const forward = p.afterForward - p.afterIdle;
  const end = p.afterBack ?? p.afterForward;
  const settle = Math.abs(p.afterRelease - end);
  const problems: string[] = [];

  if (idle > DRIVE_BARS.groundIdleM) problems.push(`drifted ${idle.toFixed(3)} m with no key held`);

  if (forward < DRIVE_BARS.groundMoveM) problems.push(`W moved it ${forward.toFixed(3)} m forward`);

  if (p.afterBack !== undefined && p.afterForward - p.afterBack < DRIVE_BARS.roverBackM)
    problems.push(`S moved it ${(p.afterForward - p.afterBack).toFixed(3)} m back`);

  if (settle > DRIVE_BARS.groundSettleM) problems.push(`kept going ${settle.toFixed(3)} m after release`);

  if (p.fell) problems.push('it fell');

  return problems;
}

export function blurProblems(atBlur: number, later: number): string[] {
  const drift = Math.abs(later - atBlur);

  return drift > DRIVE_BARS.blurDriftM ? [`kept driving ${drift.toFixed(3)} m after the window lost focus`] : [];
}

export interface ClockSample {
  wallS: number;
  simS: number;
}

export function realtimeProblems(samples: ClockSample[]): string[] {
  if (samples.length < 2) return ['no clock samples'];

  const first = samples[0];
  const last = samples.at(-1)!;
  const wall = last.wallS - first.wallS;
  const overall = (last.simS - first.simS) / wall;
  const problems: string[] = [];

  if (wall < DRIVE_BARS.realtimeSeconds - 0.5) problems.push(`measured only ${wall.toFixed(1)} s`);

  if (Number.isNaN(overall) || overall < DRIVE_BARS.realtimeLow || overall > DRIVE_BARS.realtimeHigh)
    problems.push(`ran at ${overall.toFixed(3)}x real time`);

  for (let i = 1; i < samples.length; i++) {
    const dw = samples[i].wallS - samples[i - 1].wallS;
    const rate = (samples[i].simS - samples[i - 1].simS) / dw;

    if (dw > 0.5 && rate < DRIVE_BARS.windowLow)
      problems.push(`slowed to ${rate.toFixed(2)}x at ${samples[i].wallS.toFixed(1)} s`);
  }

  return problems;
}
