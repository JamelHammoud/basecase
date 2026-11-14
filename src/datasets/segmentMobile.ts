import {
  pausesOf,
  speeds,
  STILL_MM_S,
  yawAt,
  bodyAt,
  across,
  PAUSE_S,
  type SegmentFrames,
  type SegmentRobot,
} from './segmentFrames';

const TURN_RAD_S = 0.25;
const TURN_MAX_MM_S = 40;

function wrapped(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

const TURN_LEVER_MM = 100;

function rootRates(r: SegmentFrames, root: number, frame: number) {
  const before = Math.max(0, frame - 1);
  const after = Math.min(r.frames - 1, frame + 1);
  const span = Math.max(after - before, 1) * r.dt;

  return {
    yaw: Math.abs(wrapped(yawAt(r, after, root) - yawAt(r, before, root))) / span,
    planar: across(bodyAt(r, after, root), bodyAt(r, before, root)) / span,
  };
}

const isTurn = ({ yaw, planar }: ReturnType<typeof rootRates>) => yaw > TURN_RAD_S && planar < TURN_MAX_MM_S;

function smoothed(labels: string[], minFrames: number, keep: (label: string) => boolean): string[] {
  const out = [...labels];
  const runs: Array<{ start: number; end: number; label: string }> = [];

  out.forEach((label, f) => {
    const last = runs.at(-1);

    if (last?.label === label) last.end = f + 1;
    else runs.push({ start: f, end: f + 1, label });
  });

  runs.forEach((run, i) => {
    if (keep(run.label) || run.end - run.start >= minFrames) return;

    const label =
      runs[i - 1]?.label ?? runs.find((r, j) => j > i && (keep(r.label) || r.end - r.start >= minFrames))?.label;

    if (!label) return;

    for (let f = run.start; f < run.end; f++) out[f] = label;

    run.label = label;
  });

  return out;
}

export function mobileLabels(r: SegmentFrames, robot: SegmentRobot): string[] {
  const root = robot.root ?? robot.bodies[0];
  const rates = Array.from({ length: r.frames }, (_, f) => rootRates(r, root, f));
  const moving = speeds(r, robot.bodies).map((v, f) => Math.max(v, rates[f].yaw * TURN_LEVER_MM));
  const stands = pausesOf(r, moving);
  const standing = new Set(stands.flatMap((p) => Array.from({ length: p.end - p.start }, (_, i) => p.start + i)));
  const go = robot.mobility === 'wheels' ? 'drive' : 'walk';
  const labels = Array.from({ length: r.frames }, (_, f) => {
    if (standing.has(f)) return 'stand';

    if (moving[f] < STILL_MM_S) return '';

    return isTurn(rates[f]) ? 'turn' : go;
  });
  let held = labels.find(Boolean) ?? 'stand';
  const filled = labels.map((l) => {
    held = l || held;

    return held;
  });

  return smoothed(filled, Math.round(PAUSE_S / r.dt), (label) => label === 'stand');
}
