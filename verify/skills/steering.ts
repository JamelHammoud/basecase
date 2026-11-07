import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { fixtureModel } from '../../src/skills/fixtureModels';
import { SimEngine } from '../../src/sim/engine';
import { startHeight, type V3 } from './judge';
import { loadKitSkill } from './plans';

export interface Segment {
  name: 'settle' | 'forward' | 'left' | 'right';
  from: number;
  to: number;
  v: V3;
}

export const STEERING_TIMELINE: readonly Segment[] = Object.freeze([
  { name: 'settle', from: 0, to: 1, v: [0, 0, 0] },
  { name: 'forward', from: 1, to: 5, v: [0.15, 0, 0] },
  { name: 'left', from: 5, to: 9, v: [0.1, 0, 0.5] },
  { name: 'right', from: 9, to: 13, v: [0.1, 0, -0.5] },
]);

export const STEERING_BARS = Object.freeze({
  forwardM: 0.3,
  turnRad: 0.35,
  maxTiltRad: Math.PI / 4,
  minHeightShare: 0.6,
});

export const STRAIGHT_ONLY: readonly Segment[] = STEERING_TIMELINE.map((s) => ({ ...s, v: [s.v[0], s.v[1], 0] }));

export interface Sample {
  t: number;
  x: number;
  y: number;
  yaw: number;
  tilt: number;
  z: number;
  pushed: boolean;
}

const SAMPLE_DT = 0.02;

function unwrap(previous: number | undefined, raw: number): number {
  if (previous === undefined) return raw;

  const turns = Math.round((previous - raw) / (2 * Math.PI));

  return raw + turns * 2 * Math.PI;
}

function pushed(engine: SimEngine): boolean {
  const nonzero = (values: ArrayLike<number>) => Array.from(values).some((f) => f !== 0);

  return nonzero(engine.data.xfrc_applied) || nonzero(engine.data.qfrc_applied);
}

function sample(engine: SimEngine, body: number, previous: Sample | undefined): Sample {
  const { xpos, xmat, time } = engine.data;
  const m = body * 9;

  return {
    t: time,
    x: xpos[body * 3],
    y: xpos[body * 3 + 1],
    z: xpos[body * 3 + 2],
    yaw: unwrap(previous?.yaw, Math.atan2(xmat[m + 3], xmat[m])),
    tilt: Math.acos(Math.max(-1, Math.min(1, xmat[m + 8]))),
    pushed: pushed(engine),
  };
}

export function driveTimeline(mj: MainModule, engine: SimEngine, timeline: readonly Segment[]): Sample[] {
  const root = engine.sim.robots[0].root;
  const body = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, root);
  const samples: Sample[] = [sample(engine, body, undefined)];
  const end = timeline.at(-1)?.to ?? 0;

  for (const segment of timeline) {
    engine.command({ v: segment.v });

    while (engine.data.time < Math.min(segment.to, end) - 1e-9) {
      engine.step(SAMPLE_DT);
      samples.push(sample(engine, body, samples.at(-1)));
    }
  }

  return samples;
}

const at = (samples: Sample[], t: number) =>
  samples.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best));

export interface SegmentResult {
  name: Segment['name'];
  forwardM: number;
  turnRad: number;
}

export function segmentResults(samples: Sample[], timeline: readonly Segment[]): SegmentResult[] {
  const start = samples[0];

  return timeline.map((segment) => {
    const a = at(samples, segment.from);
    const b = at(samples, segment.to);
    const heading = a.yaw - start.yaw;
    const [dx, dy] = [b.x - a.x, b.y - a.y];

    return { name: segment.name, forwardM: dx * Math.sin(heading) - dy * Math.cos(heading), turnRad: b.yaw - a.yaw };
  });
}

function turnProblem(result: SegmentResult, wanted: number): string[] {
  if (wanted === 0) return [];

  const signed = Math.sign(wanted) * result.turnRad;

  return signed >= STEERING_BARS.turnRad
    ? []
    : [
        `turn: ${result.name} turned ${result.turnRad.toFixed(2)} rad, needs ${Math.sign(wanted) > 0 ? '+' : '−'}${STEERING_BARS.turnRad}`,
      ];
}

function forwardProblem(result: SegmentResult): string[] {
  return result.name !== 'forward' || result.forwardM >= STEERING_BARS.forwardM
    ? []
    : [`forward: walked ${result.forwardM.toFixed(2)} m, needs ${STEERING_BARS.forwardM}`];
}

function fallProblems(samples: Sample[], startHeight: number): string[] {
  const tilted = samples.find((s) => s.tilt > STEERING_BARS.maxTiltRad);
  const low = samples.find((s) => s.z < STEERING_BARS.minHeightShare * startHeight);
  const out: string[] = [];

  if (tilted) out.push(`fell: tilted ${tilted.tilt.toFixed(2)} rad at ${tilted.t.toFixed(2)} s`);

  if (low) out.push(`fell: base at ${low.z.toFixed(3)} m at ${low.t.toFixed(2)} s`);

  if (samples.some((s) => s.pushed)) out.push('pushed: an external force moved the robot');

  return out;
}

export function steeringProblems(samples: Sample[], options: { wanted: readonly Segment[]; startHeight: number }) {
  const results = segmentResults(samples, options.wanted);

  return [
    ...results.flatMap(forwardProblem),
    ...results.flatMap((r, i) => turnProblem(r, options.wanted[i].v[2])),
    ...fallProblems(samples, options.startHeight),
  ];
}

export async function driveBiped(timeline: readonly Segment[]) {
  const mj = await loadMujoco();
  const model = fixtureModel('biped-servo');
  const { skill } = loadKitSkill('biped-servo', 'velocity-tracking');
  const engine = new SimEngine(mj, model);

  try {
    engine.setController(skill.controller);
    engine.reset(model.initial);

    return { samples: driveTimeline(mj, engine, timeline), startHeight: startHeight(mj, model) };
  } finally {
    engine.dispose();
  }
}
