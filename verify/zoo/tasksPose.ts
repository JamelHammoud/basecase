import type { Formula, State } from '../../src/skills/contract';
import type { SignalSource } from '../../src/skills/environment';
import type { Pose } from './bodies';
import {
  abs,
  all,
  always,
  atom,
  baseSignals,
  both,
  contract,
  eventually,
  fellFailure,
  holdFor,
  sequence,
  sig,
  travel,
  within,
} from './formula';
import { between, pick, round, type Rng } from './rng';
import { deg, LEGS, type DrawCtx, type Keyframe, type TaskDraw, type ZooTask } from './taskTypes';

const height = sig('height');
const tilt = sig('tilt');

interface PoseSpec {
  prompt: string;
  horizonS: number;
  success: Formula;
  intent: Keyframe[];
  signals?: Record<string, SignalSource>;
  restIsGoal?: boolean;
  startOffsetDeg?: number;
}

function poseDraw(ctx: DrawCtx, spec: PoseSpec): TaskDraw {
  return {
    prompt: spec.prompt,
    horizonS: spec.horizonS,
    contract: contract(spec.success, [fellFailure(ctx.heightM)]),
    signals: { ...baseSignals(ctx.body.rootPart), ...spec.signals },
    intent: spec.intent,
    restIsGoal: spec.restIsGoal,
    startOffsetDeg: spec.startOffsetDeg,
  };
}

const at = (t: number, pose: Pose = {}): Keyframe => ({ t, pose });
const tall = (h0: number): State => all(atom(height, '>', 0.92 * h0), atom(tilt, '<', 0.3, 0.05));
const crouched = (h0: number, share: number): State =>
  all(within(height, share * h0, 0.075 * h0), atom(tilt, '<', 0.3, 0.05));
const share = (rng: Rng) => round(between(rng, 0.65, 0.8), 0.05);

const STAND_FROM_DEG = 40;

function standTall(ctx: DrawCtx): TaskDraw {
  const h = Math.round(between(ctx.rng, 6, 10));
  const h0 = ctx.heightM;

  return poseDraw(ctx, {
    prompt: `Start with every leg joint bent ${STAND_FROM_DEG} degrees off its rest angle, stand up tall within 2 seconds, then stay tall and still until ${h} seconds, without wandering more than 10 cm.`,
    horizonS: h,
    success: both(
      always(all(atom(height, '>', 0.9 * h0), atom(tilt, '<', 0.25, 0.05)), { from: 2, to: h }),
      always(all(atom(abs(travel('forward')), '<', 0.1), atom(abs(travel('side')), '<', 0.1))),
    ),
    intent: [at(0), at(h)],
    restIsGoal: true,
    startOffsetDeg: STAND_FROM_DEG,
  });
}

function crouch(ctx: DrawCtx): TaskDraw {
  const s = share(ctx.rng);
  const h0 = ctx.heightM;

  return poseDraw(ctx, {
    prompt: `Crouch to about ${Math.round(s * 100)}% of your standing height and hold it for 2 seconds, within 6 seconds.`,
    horizonS: 6,
    success: holdFor(2, crouched(h0, s)),
    intent: [at(0), at(1.5, { up: -(1 - s) * h0 }), at(6, { up: -(1 - s) * h0 })],
  });
}

function crouchThenRise(ctx: DrawCtx): TaskDraw {
  const s = share(ctx.rng);
  const h0 = ctx.heightM;
  const low = { up: -(1 - s) * h0 };

  return poseDraw(ctx, {
    prompt: `Crouch to about ${Math.round(s * 100)}% of your height for a second, then stand back up tall for a second, within 8 seconds.`,
    horizonS: 8,
    success: sequence(holdFor(1, crouched(h0, s)), holdFor(1, tall(h0))),
    intent: [at(0), at(1.5, low), at(3.5, low), at(5), at(8)],
  });
}

const LIFT_ANGLES = [-50, -30, 0, 30, 50];

function legJoints(ctx: DrawCtx, foot: string): string[] {
  const prefix = foot.split('_')[0];

  return ctx.body.model.joints
    .map((j) => j.id)
    .filter((id) => id.startsWith(`${prefix}_`) && !/bend|tilt/.test(id))
    .slice(0, 2);
}

const LIFT_M = 0.015;

function liftPose(ctx: DrawCtx, foot: string): { pose: Pose; restZ: number } {
  const [a, b] = legJoints(ctx, foot);
  const restZ = ctx.poser.partAt(foot)[2];
  const lifts = LIFT_ANGLES.flatMap((da) =>
    LIFT_ANGLES.map((db) => {
      const pose = { joints: b ? { [a]: da, [b]: db } : { [a]: da } };

      return { pose, rise: ctx.poser.partAt(foot, pose)[2] - restZ };
    }),
  ).sort((x, y) => y.rise - x.rise);

  if (lifts[0].rise < LIFT_M + 0.008) throw new Error(`Generator: no lift raises ${foot} on ${ctx.body.id}`);

  return { pose: lifts[0].pose, restZ };
}

function liftFoot(ctx: DrawCtx): TaskDraw {
  const foot = pick(ctx.rng, ctx.body.feet);
  const lifted = liftPose(ctx, foot);

  return poseDraw(ctx, {
    prompt: `Raise the ${foot} part at least ${Math.round(LIFT_M * 1000)} mm above where it rests and hold it there for 2 seconds while staying up, within 6 seconds.`,
    horizonS: 6,
    success: holdFor(
      2,
      all(
        atom(sig('foot_z'), '>', lifted.restZ + LIFT_M, 0.005),
        atom(tilt, '<', 0.3, 0.05),
        atom(height, '>', 0.7 * ctx.heightM),
      ),
    ),
    intent: [at(0), at(1.5, lifted.pose), at(6, lifted.pose)],
    signals: { foot_z: { kind: 'part-position', part: foot, axis: 'z' } },
  });
}

function lean(ctx: DrawCtx): TaskDraw {
  const a = round(between(ctx.rng, 0.15, 0.3), 0.01);

  return poseDraw(ctx, {
    prompt: `Lean your body about ${deg(a)}, give or take 4, and hold it for 2 seconds without falling, within 6 seconds.`,
    horizonS: 6,
    success: holdFor(2, all(within(tilt, a, 0.07, 0.05), atom(height, '>', 0.6 * ctx.heightM))),
    intent: [at(0), at(1.5, { tilt: a }), at(6, { tilt: a })],
  });
}

function bob(ctx: DrawCtx): TaskDraw {
  const h0 = ctx.heightM;
  const low = atom(height, '<', 0.8 * h0);
  const high = atom(height, '>', 0.92 * h0);
  const down = { up: -0.28 * h0 };

  return poseDraw(ctx, {
    prompt: 'Bob down below 80% of your height and back up, twice, within 8 seconds.',
    horizonS: 8,
    success: sequence(eventually(low), eventually(high), eventually(low), eventually(high)),
    intent: [at(0), at(1.5, down), at(3), at(4.5, down), at(6), at(8)],
  });
}

function jump(ctx: DrawCtx): TaskDraw {
  const j = round(between(ctx.rng, 0.02, 0.04), 0.005);
  const h0 = ctx.heightM;

  return poseDraw(ctx, {
    prompt: `Jump so your body rises at least ${Math.round(j * 1000)} mm above standing, then land and stay up for a second, within 5 seconds.`,
    horizonS: 5,
    success: sequence(
      eventually(atom(height, '>', h0 + j, 0.005)),
      holdFor(1, all(atom(tilt, '<', 0.3, 0.05), atom(height, '>', 0.8 * h0))),
    ),
    intent: [at(0), at(1.8), at(2, { up: j + 0.02 }), at(2.4), at(5)],
  });
}

const posture = (id: string, draw: (ctx: DrawCtx) => TaskDraw, say: string): ZooTask => ({
  id,
  family: 'pose',
  classes: LEGS,
  say: () => say,
  draw,
});

export const POSE_TASKS: ZooTask[] = [
  posture('stand-tall', standTall, 'Stand still and tall for 8 seconds.'),
  posture('crouch', crouch, 'Crouch down to about three quarters of your height and hold it.'),
  posture('crouch-then-rise', crouchThenRise, 'Crouch down, then stand back up tall.'),
  posture('lift-one-foot', liftFoot, 'Lift one foot off the ground for 2 seconds.'),
  posture('lean', lean, 'Lean your body about 12 degrees and hold it.'),
  posture('bob', bob, 'Bob down and back up twice.'),
  posture('jump', jump, 'Jump, then land and stay up.'),
];
