import type { Formula } from '../../src/skills/contract';
import type { SignalSource } from '../../src/skills/environment';
import type { Pose } from './bodies';
import {
  all,
  always,
  atom,
  both,
  contract,
  eventually,
  holdFor,
  near,
  pointSignals,
  sequence,
  sig,
  within,
  type V3,
} from './formula';
import { between, round, shuffled, type Rng } from './rng';
import { ARMS, mm, type DrawCtx, type Keyframe, type TaskDraw, type ZooTask } from './taskTypes';

const D2R = Math.PI / 180;
const TOL = 0.02;
const TRIES = 200;

interface ArmSpec {
  prompt: string;
  horizonS: number;
  success: Formula;
  intent: Keyframe[];
  signals?: Record<string, SignalSource>;
}

const tipOf = (ctx: DrawCtx) => {
  if (!ctx.body.tip) throw new Error(`Generator: ${ctx.body.id} has no arm tip`);

  return ctx.body.tip;
};

function armDraw(ctx: DrawCtx, spec: ArmSpec): TaskDraw {
  return {
    prompt: spec.prompt,
    horizonS: spec.horizonS,
    contract: contract(spec.success),
    signals: { ...pointSignals('tip', tipOf(ctx)), ...spec.signals },
    intent: spec.intent,
  };
}

const armJoints = (ctx: DrawCtx) =>
  ctx.body.model.joints.filter((j) => j.robot === ctx.body.model.robots[0].key).map((j) => j.id);

const randomPose = (ctx: DrawCtx, spread = 50): Pose => ({
  joints: Object.fromEntries(armJoints(ctx).map((id) => [id, round(between(ctx.rng, -spread, spread), 1)])),
});

const nudged = (ctx: DrawCtx, pose: Pose, spread: number): Pose => ({
  joints: Object.fromEntries(
    Object.entries(pose.joints ?? {}).map(([id, v]) => [id, v + round(between(ctx.rng, -spread, spread), 1)]),
  ),
});

const tipAt = (ctx: DrawCtx, pose: Pose = {}) => ctx.poser.partAt(tipOf(ctx), pose);
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function where(ctx: DrawCtx, p: V3): string {
  const base = ctx.poser.rootAt();
  const right = -(p[0] - base[0]);
  const forward = -(p[1] - base[1]);
  const up = p[2] - base[2];
  const part = (v: number, pos: string, neg: string) => `${mm(Math.abs(v))} ${v >= 0 ? pos : neg}`;

  return `${part(right, 'right', 'left')}, ${part(forward, 'forward', 'back')} and ${part(up, 'up', 'down')} from the base`;
}

interface Search {
  spread?: number;
  minZ?: number;
  tries?: number;
}

function reachable(
  ctx: DrawCtx,
  accept: (pose: Pose, at: V3) => boolean,
  { spread = 50, minZ = 0.03, tries = TRIES }: Search = {},
): { pose: Pose; at: V3 } {
  for (let i = 0; i < tries; i++) {
    const pose = randomPose(ctx, spread);
    const at = tipAt(ctx, pose);

    if (at[2] > minZ && accept(pose, at)) return { pose, at };
  }

  throw new Error(`Generator: no reachable pose on ${ctx.body.id}`);
}

const key = (t: number, pose: Pose = {}): Keyframe => ({ t, pose });

function chain(ctx: DrawCtx, count: number): Array<{ pose: Pose; at: V3 }> {
  const out = [reachable(ctx, (_, at) => dist(at, tipAt(ctx)) > 0.05)];

  for (let i = 1; i < TRIES && out.length < count; i++) {
    const pose = nudged(ctx, out.at(-1)!.pose, 40);
    const at = tipAt(ctx, pose);

    if (at[2] > 0.03 && out.every((w) => dist(w.at, at) > 0.04)) out.push({ pose, at });
  }

  return out;
}

function waypoints(ctx: DrawCtx, count: number): Array<{ pose: Pose; at: V3 }> {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const out = chain(ctx, count);

    if (out.length === count) return out;
  }

  throw new Error(`Generator: no ${count} spaced points on ${ctx.body.id}`);
}

function reachPoints(count: number) {
  return (ctx: DrawCtx): TaskDraw => {
    const points = waypoints(ctx, count);
    const hold = count === 1 ? 1 : 0.5;
    const list = points.map((p, i) => `${count > 1 ? `${i + 1}) ` : ''}${where(ctx, p.at)}`).join('; ');
    const h = 3 + 2.5 * count;

    return armDraw(ctx, {
      prompt: `Bring the ${tipOf(ctx)} part to ${count > 1 ? 'these points in order' : 'the point'} ${list}, within 2 cm${count > 1 ? ' at each' : ''}, holding ${hold} s, all within ${h} seconds.`,
      horizonS: h,
      success: sequence(...points.map((p) => holdFor(hold, near('tip', p.at, TOL)))),
      intent: [
        key(0),
        ...points.flatMap((p, i) => [key(2 + 2.5 * i, p.pose), key(3 + 2.5 * i, p.pose)]),
        key(h, points.at(-1)!.pose),
      ],
    });
  };
}

function holdLower(ctx: DrawCtx): TaskDraw {
  const z0 = tipAt(ctx)[2];
  const goal = reachable(ctx, (_, at) => z0 - at[2] > 0.06 && at[2] > 0.08);
  const drop = round(z0 - goal.at[2], 0.005);

  return armDraw(ctx, {
    prompt: `Lower the ${tipOf(ctx)} part about ${mm(drop)} below where it starts, within 3 cm, and keep it there for 3 seconds, within 6 seconds.`,
    horizonS: 6,
    success: holdFor(3, within(sig('tip_z'), z0 - drop, 0.03, 0.01)),
    intent: [key(0), key(2, goal.pose), key(6, goal.pose)],
  });
}

function jointPose(ctx: DrawCtx): TaskDraw {
  const [a, b] = shuffled(ctx.rng, armJoints(ctx));
  const offsets = [a, b].map(() => round(between(ctx.rng, 20, 50), 1) * (ctx.rng() < 0.5 ? 1 : -1));
  const targets = [a, b].map((id, i) => Math.round(ctx.poser.restJointDeg(id) + offsets[i]));
  const pose = { joints: { [a]: targets[0] - ctx.poser.restJointDeg(a), [b]: targets[1] - ctx.poser.restJointDeg(b) } };

  return armDraw(ctx, {
    prompt: `Set joint ${a} to ${targets[0]}° and joint ${b} to ${targets[1]}°, each within 5°, and hold for a second, within 5 seconds.`,
    horizonS: 5,
    success: holdFor(
      1,
      all(within(sig('qa'), targets[0] * D2R, 5 * D2R, 0.02), within(sig('qb'), targets[1] * D2R, 5 * D2R, 0.02)),
    ),
    intent: [key(0), key(2, pose), key(5, pose)],
    signals: { qa: { kind: 'joint-position', joint: a }, qb: { kind: 'joint-position', joint: b } },
  });
}

function wave(ctx: DrawCtx): TaskDraw {
  const id = ctx.body.waveJoint;
  const c = ctx.poser.restJointDeg(id);
  const a = Math.round(between(ctx.rng, 15, 25));
  const q = sig('q');
  const up = eventually(atom(q, '>', (c + a) * D2R, 0.02));
  const down = eventually(atom(q, '<', (c - a) * D2R, 0.02));
  const swing = (t: number, s: number): Keyframe => key(t, { joints: { [id]: s * (a + 5) } });

  return armDraw(ctx, {
    prompt: `Wave joint ${id} back and forth twice, at least ${a}° each side of ${Math.round(c)}°, within 6 seconds.`,
    horizonS: 6,
    success: sequence(up, down, up, down),
    intent: [key(0), swing(1, 1), swing(2, -1), swing(3, 1), swing(4, -1), key(6)],
    signals: { q: { kind: 'joint-position', joint: id } },
  });
}

function lowestOnTheWay(ctx: DrawCtx, pose: Pose): number {
  const scaled = (k: number): Pose => ({
    joints: Object.fromEntries(Object.entries(pose.joints ?? {}).map(([id, v]) => [id, v * k])),
  });

  return Math.min(...Array.from({ length: 21 }, (_, i) => tipAt(ctx, scaled(i / 20))[2]));
}

function avoidLow(ctx: DrawCtx): TaskDraw {
  const start = tipAt(ctx);
  const goal = reachable(ctx, (pose, at) => dist(at, start) > 0.06 && lowestOnTheWay(ctx, pose) > 0.04);
  const floor = round(lowestOnTheWay(ctx, goal.pose) - 0.025, 0.005);

  return armDraw(ctx, {
    prompt: `Bring the ${tipOf(ctx)} part to ${where(ctx, goal.at)}, within 2 cm, and hold it a second, never letting it drop below ${mm(floor)} above the floor, within 5 seconds.`,
    horizonS: 5,
    success: both(holdFor(1, near('tip', goal.at, TOL)), always(atom(sig('tip_z'), '>', floor, 0.01))),
    intent: [key(0), key(2.5, goal.pose), key(5, goal.pose)],
  });
}

function downAndBack(ctx: DrawCtx): TaskDraw {
  const start = tipAt(ctx);
  const goal = reachable(ctx, (_, at) => start[2] - at[2] > 0.065);
  const drop = round(start[2] - goal.at[2] - 0.015, 0.005);

  return armDraw(ctx, {
    prompt: `Dip the ${tipOf(ctx)} part at least ${mm(drop)} lower, then put it back where it started, within 2 cm, for a second, all within 6 seconds.`,
    horizonS: 6,
    success: sequence(eventually(atom(sig('tip_z'), '<', start[2] - drop, 0.01)), holdFor(1, near('tip', start, TOL))),
    intent: [key(0), key(2, goal.pose), key(2.5, goal.pose), key(4.5), key(6)],
  });
}

const NEAR_FLOOR_M = 0.05;

function floorDip(ctx: DrawCtx): TaskDraw {
  const tip = tipOf(ctx);
  const start = tipAt(ctx);
  const low = reachable(ctx, (_, at) => at[2] < NEAR_FLOOR_M - 0.01, { spread: 90, minZ: 0.015, tries: 4000 });

  return armDraw(ctx, {
    prompt: `Bring the ${tip} part down to within ${mm(NEAR_FLOOR_M)} of the floor for half a second, then back where it started, within 3 cm, for a second, all within 7 seconds.`,
    horizonS: 7,
    success: sequence(holdFor(0.5, atom(sig('tip_z'), '<', NEAR_FLOOR_M, 0.01)), holdFor(1, near('tip', start, 0.03))),
    intent: [key(0), key(2.5, low.pose), key(3.5, low.pose), key(5.5), key(7)],
  });
}

const armTask = (id: string, draw: (ctx: DrawCtx) => TaskDraw, say: (rng: Rng) => string): ZooTask => ({
  id,
  family: 'arm',
  classes: ARMS,
  say,
  draw,
});

const sayPoint = (rng: Rng) =>
  `${Math.round(between(rng, 40, 160))} mm right, ${Math.round(between(rng, 40, 160))} mm forward and ${Math.round(between(rng, 60, 200))} mm up from the base`;

export const ARM_TASKS: ZooTask[] = [
  armTask('reach-point', reachPoints(1), (rng) => `Bring the end of your arm to ${sayPoint(rng)} and hold it.`),
  armTask(
    'reach-two',
    reachPoints(2),
    (rng) => `Touch ${sayPoint(rng)}, then ${sayPoint(rng)}, with the end of your arm.`,
  ),
  armTask(
    'reach-three',
    reachPoints(3),
    (rng) => `Touch three points in order with your arm, starting at ${sayPoint(rng)}.`,
  ),
  armTask('hold-lower', holdLower, () => 'Lower the end of your arm 60 mm and keep it there for 3 seconds.'),
  armTask('joint-pose', jointPose, () => 'Bend your elbow to 40° and your shoulder to -20°, and hold.'),
  armTask('wave', wave, () => 'Wave your arm back and forth twice.'),
  armTask(
    'trace-four',
    reachPoints(4),
    (rng) => `Trace a path through four points with your arm, starting at ${sayPoint(rng)}.`,
  ),
  armTask('avoid-low', avoidLow, (rng) => `Reach ${sayPoint(rng)} without ever dropping below 50 mm.`),
  armTask('down-and-back', downAndBack, () => 'Dip the end of your arm 50 mm, then put it back where it started.'),
  armTask('floor-dip', floorDip, () => 'Bring the end of your arm down near the floor, then lift it back.'),
];
