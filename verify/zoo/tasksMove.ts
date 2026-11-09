import type { Formula } from '../../src/skills/contract';
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
import { metres, MOBILE, type DrawCtx, type Keyframe, type TaskDraw, type ZooTask } from './taskTypes';

const SPEED = 0.08;
const TOL = 0.08;

const fwd = travel('forward');
const side = travel('side');

interface MoveSpec {
  prompt: string;
  horizonS: number;
  success: Formula;
  intent: Keyframe[];
}

function moveDraw(ctx: DrawCtx, spec: MoveSpec): TaskDraw {
  return {
    prompt: spec.prompt,
    horizonS: spec.horizonS,
    contract: contract(spec.success, [fellFailure(ctx.heightM)]),
    signals: baseSignals(ctx.body.rootPart),
    intent: spec.intent,
  };
}

const distance = (rng: Rng, lo: number, hi: number) => round(between(rng, lo, hi), 0.05);
const horizonFor = (metresToGo: number, extra = 3) => Math.round(metresToGo / SPEED) + extra;
const at = (t: number, forward = 0, right = 0): Keyframe => ({ t, pose: { forward, right } });

const straight = (sign: 1 | -1, word: string) => ({
  say: (rng: Rng) => `${word} ${metres(distance(rng, 0.3, 0.6), rng)} and stop there.`,
  draw: (ctx: DrawCtx) => {
    const d = distance(ctx.rng, 0.3, 0.6);
    const h = horizonFor(d);
    const prompt = `${pick(ctx.rng, [word, `${word} about`])} ${metres(d, ctx.rng)} and stop there, within ${h} seconds.`;

    return moveDraw(ctx, {
      prompt,
      horizonS: h,
      success: holdFor(1, within(fwd, sign * d, TOL)),
      intent: [at(0), at(h - 2, sign * d), at(h, sign * d)],
    });
  },
});

function stopOnMark(ctx: DrawCtx): TaskDraw {
  const d = distance(ctx.rng, 0.3, 0.5);
  const h = horizonFor(d, 4);

  return moveDraw(ctx, {
    prompt: `Go ${metres(d, ctx.rng)} forward and stay on that mark, within 5 cm, for the last 2 seconds of ${h}.`,
    horizonS: h,
    success: always(within(fwd, d, 0.05), { last: 2 }),
    intent: [at(0), at(h - 3, d), at(h, d)],
  });
}

function goAndReturn(ctx: DrawCtx): TaskDraw {
  const d = distance(ctx.rng, 0.2, 0.4);
  const h = horizonFor(2 * d, 4);

  return moveDraw(ctx, {
    prompt: `Go ${metres(d, ctx.rng)} forward, then come back to where you started, all within ${h} seconds.`,
    horizonS: h,
    success: sequence(eventually(atom(fwd, '>', d - TOL)), holdFor(1, within(fwd, 0, TOL))),
    intent: [at(0), at(h / 2 - 1, d), at(h - 1.5, 0), at(h, 0)],
  });
}

function steady(ctx: DrawCtx): TaskDraw {
  const step = round(between(ctx.rng, 0.1, 0.2), 0.02);
  const windows = [0, 4, 8].map((from, i) => eventually(atom(fwd, '>', step * (i + 1), 0.02), { from, to: from + 4 }));

  return moveDraw(ctx, {
    prompt: `Keep moving forward for 12 seconds, covering at least ${metres(step, ctx.rng)} in every 4 seconds.`,
    horizonS: 12,
    success: both(...windows),
    intent: [at(0), at(12, step * 3.3)],
  });
}

function upright(ctx: DrawCtx): TaskDraw {
  const d = distance(ctx.rng, 0.3, 0.5);
  const h = horizonFor(d);

  return moveDraw(ctx, {
    prompt: `Move ${metres(d, ctx.rng)} forward within ${h} seconds without tipping more than 11 degrees.`,
    horizonS: h,
    success: both(holdFor(1, atom(fwd, '>', d - TOL)), always(atom(sig('tilt'), '<', 0.2, 0.05))),
    intent: [at(0), at(h - 2, d), at(h, d)],
  });
}

const sidestep = (sign: 1 | -1, word: string) => ({
  say: (rng: Rng) => `Shift ${metres(distance(rng, 0.15, 0.3), rng)} to your ${word}.`,
  draw: (ctx: DrawCtx) => {
    const l = distance(ctx.rng, 0.15, 0.3);
    const h = horizonFor(l, 6);

    return moveDraw(ctx, {
      prompt: `Shift ${metres(l, ctx.rng)} to your ${word} within ${h} seconds, never more than 15 cm ahead of or behind where you started.`,
      horizonS: h,
      success: both(holdFor(1, within(side, sign * l, 0.06)), always(atom(abs(fwd), '<', 0.15))),
      intent: [at(0), at(h - 2, 0, -sign * l), at(h, 0, -sign * l)],
    });
  },
});

function diagonal(ctx: DrawCtx): TaskDraw {
  const f = distance(ctx.rng, 0.2, 0.4);
  const l = distance(ctx.rng, 0.1, 0.25) * (ctx.rng() < 0.5 ? 1 : -1);
  const h = horizonFor(f + Math.abs(l), 5);
  const word = l > 0 ? 'left' : 'right';

  return moveDraw(ctx, {
    prompt: `Go to the spot ${metres(f, ctx.rng)} ahead and ${metres(Math.abs(l), ctx.rng)} to the ${word}, within 10 cm, and stop there within ${h} seconds.`,
    horizonS: h,
    success: holdFor(1, all(within(fwd, f, 0.1), within(side, l, 0.1))),
    intent: [at(0), at(h - 2, f, -l), at(h, f, -l)],
  });
}

function slowCreep(ctx: DrawCtx): TaskDraw {
  const d = distance(ctx.rng, 0.3, 0.5);

  return moveDraw(ctx, {
    prompt: `Move ${metres(d, ctx.rng)} forward over 12 seconds, taking your time: be less than halfway there at 6 seconds.`,
    horizonS: 12,
    success: both(always(atom(fwd, '<', d / 2), { from: 0, to: 6 }), holdFor(1, atom(fwd, '>', d - TOL))),
    intent: [at(0), at(6, d * 0.4), at(10, d), at(12, d)],
  });
}

const simple = (id: string, draw: (ctx: DrawCtx) => TaskDraw, say: (rng: Rng) => string): ZooTask => ({
  id,
  family: 'move',
  classes: MOBILE,
  say,
  draw,
});

export const MOVE_TASKS: ZooTask[] = [
  { id: 'move-forward', family: 'move', classes: MOBILE, ...straight(1, 'Move forward') },
  { id: 'move-backward', family: 'move', classes: MOBILE, ...straight(-1, 'Back up') },
  simple(
    'stop-on-mark',
    stopOnMark,
    (rng) => `Go ${metres(distance(rng, 0.3, 0.5), rng)} forward and stay on that mark.`,
  ),
  simple('go-and-return', goAndReturn, (rng) => `Go ${metres(distance(rng, 0.2, 0.4), rng)} forward and come back.`),
  simple('steady-progress', steady, () => 'Keep moving forward steadily for 12 seconds.'),
  simple('upright-forward', upright, (rng) => `Move ${metres(distance(rng, 0.3, 0.5), rng)} forward without tipping.`),
  { id: 'sidestep-left', family: 'move', classes: MOBILE, ...sidestep(1, 'left') },
  { id: 'sidestep-right', family: 'move', classes: MOBILE, ...sidestep(-1, 'right') },
  simple(
    'diagonal',
    diagonal,
    (rng) => `Go to the spot ${metres(distance(rng, 0.2, 0.4), rng)} ahead and a little to the left.`,
  ),
  simple('slow-creep', slowCreep, (rng) => `Creep ${metres(distance(rng, 0.3, 0.5), rng)} forward, slowly.`),
];
