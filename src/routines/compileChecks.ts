import type { CompileContext } from './compileContext';
import { checkCondition, leaves } from './compileConditions';
import { findNode } from './nodes';
import type { AskStep, InferStep, Reaction, Resource, Step, TogetherStep, WaitStep } from './schema';
import { childSequences, forEachStep } from './schema';

const PERCEPTION_HZ = { min: 1, max: 30 };
const ASK_MS = { min: 200, max: 60_000 };
const INFER_MAX_MS = 30_000;
const ASK_MIN_COOLDOWN_MS = 5000;
const MAX_ASKS_PER_REACTION = 4;
const MAX_FIBERS = 16;

function checkDo(ctx: CompileContext, step: Extract<Step, { kind: 'do' }>) {
  const node = ctx.nodeOf(step);
  const skill = ctx.skills.get(step.skill);

  if (!skill) return ctx.fail('unknown-skill', `There’s no ${step.skill} skill for this robot.`, node);

  if (skill.status === 'needsTraining') ctx.fail('needs-training', `${step.skill} needs training first.`, node);

  const same = skill.holds.length === step.holds.length && skill.holds.every((r) => step.holds.includes(r));

  if (!same) ctx.fail('holds-mismatch', `${step.skill} holds ${skill.holds.join(' and ')}.`, node);
}

function checkInfer(ctx: CompileContext, step: InferStep) {
  const node = ctx.nodeOf(step);
  const model = findNode(step.model);
  const inputType = ctx.inputType(step.input);
  const missing = ctx.requiresCapability(step.input);

  if (!model || model.tier !== 'perception') {
    return ctx.fail('unknown-model', `There’s no ${step.model} model to check with.`, node);
  }

  if (!model.outputs.includes(step.output.type)) {
    ctx.fail('type-mismatch', `${model.label} doesn’t return ${step.output.type}.`, node);
  }

  if (inputType === undefined) ctx.fail('unknown-fact', `Nothing in this Routine publishes ${step.input}.`, node);
  else if (!model.inputs.includes(inputType as never)) {
    ctx.fail('type-mismatch', `${model.label} can’t look at ${step.input}.`, node);
  }

  if (missing) ctx.fail('missing-capability', `Add ${missing} to what this Routine needs.`, node);

  if (step.timeoutMs > INFER_MAX_MS) ctx.fail('timeout-out-of-range', `Give ${node} 30 s or less.`, node);
}

function checkAsk(ctx: CompileContext, step: AskStep) {
  const node = ctx.nodeOf(step);

  if ('holds' in step) ctx.fail('ask-holds-resource', 'Ask never holds the body, head or voice.', node);

  if (step.timeoutMs < ASK_MS.min || step.timeoutMs > ASK_MS.max) {
    ctx.fail('timeout-out-of-range', 'Give Ask between 0.2 and 60 s.', node);
  }

  if (step.input !== undefined && ctx.inputType(step.input) === undefined) {
    ctx.fail('unknown-fact', `Nothing in this Routine publishes ${step.input}.`, node);
  }

  const retries = [...step.onTimeout, ...step.onFail];
  let nested = false;

  forEachStep(retries, (s) => (nested ||= s.kind === 'ask'));

  if (nested) ctx.fail('unbounded-ask', 'Ask again only from a new reaction, never from a failed Ask.', node);
}

function checkWait(ctx: CompileContext, step: WaitStep) {
  const node = ctx.nodeOf(step);

  if (step.until) checkCondition(ctx, step.until, node);

  if (!step.until && (step.ms ?? 0) >= step.timeoutMs) {
    ctx.fail('wait-never-ends', `${node} always runs out of time before it ends.`, node);
  }
}

function checkStep(ctx: CompileContext, step: Step) {
  switch (step.kind) {
    case 'do':
      return checkDo(ctx, step);
    case 'infer':
      return checkInfer(ctx, step);
    case 'ask':
      return checkAsk(ctx, step);
    case 'wait':
      return checkWait(ctx, step);
    case 'if':
      return checkCondition(ctx, step.test, ctx.nodeOf(step));
    case 'say':
      if (!ctx.routine.requires.includes('speaker')) {
        ctx.fail('missing-capability', 'Add speaker to what this Routine needs.', ctx.nodeOf(step));
      }
  }
}

function checkWatchers(ctx: CompileContext) {
  for (const w of ctx.routine.watchers) {
    const model = findNode(w.model);

    if (!model || model.tier === 'remote') ctx.fail('unknown-model', `There’s no ${w.model} model.`, w.id);
    else if (!model.outputs.includes(w.publishes.type)) {
      ctx.fail('type-mismatch', `${model.label} doesn’t publish ${w.publishes.type}.`, w.id);
    }

    if (w.rateHz < PERCEPTION_HZ.min || w.rateHz > PERCEPTION_HZ.max) {
      ctx.fail('rate-out-of-range', 'Watchers run between 1 and 30 times a second.', w.id);
    }

    if (w.maxAgeMs < 1000 / w.rateHz) {
      ctx.fail('stale-by-design', `${w.id} goes stale before its next answer arrives.`, w.id);
    }

    if (w.when) checkCondition(ctx, w.when, w.id);

    const missing = model?.inputs.includes('image') ? ctx.requiresCapability('camera') : undefined;

    if (missing) ctx.fail('missing-capability', `Add ${missing} to what this Routine needs.`, w.id);
  }
}

function countAsks(steps: Step[]): number {
  let asks = 0;

  forEachStep(steps, (s) => (asks += Number(s.kind === 'ask')));

  return asks;
}

export function fibersNeeded(steps: Step[]): number {
  let most = 1;

  for (const step of steps) {
    const nested =
      step.kind === 'together'
        ? step.branches.reduce((sum, b) => sum + fibersNeeded(b), 1)
        : Math.max(1, ...childSequences(step).map(fibersNeeded));

    most = Math.max(most, nested);
  }

  return most;
}

function checkReaction(ctx: CompileContext, r: Reaction) {
  checkCondition(ctx, r.when, r.id);

  for (const leaf of leaves(r.when)) {
    if (ctx.facts.get(leaf.fact)?.source !== 'watcher' && ctx.facts.has(leaf.fact)) {
      ctx.fail('unknown-fact', `${r.id} can only start from what a watcher sees.`, r.id);
    }
  }

  if (r.steps.length === 0) ctx.fail('empty-reaction', `${r.id} has no steps.`, r.id);

  const asks = countAsks(r.steps);

  if (asks > 0 && r.cooldownMs < ASK_MIN_COOLDOWN_MS) {
    ctx.fail('unbounded-ask', `${r.id} asks, so give it a cooldown of at least 5 s.`, r.id);
  }

  if (asks > MAX_ASKS_PER_REACTION) ctx.fail('unbounded-ask', `${r.id} asks more than 4 times.`, r.id);

  if (fibersNeeded(r.steps) > MAX_FIBERS) ctx.fail('too-large', `${r.id} runs too many branches at once.`, r.id);

  const base = ctx.skills.get(ctx.routine.base.skill);

  if (r.body === 'stopFirst' && base?.interrupt === 'never') {
    ctx.fail('uninterruptible', `${base.id} can’t be stopped, so ${r.id} can’t stop first.`, r.id);
  }
}

function resourcesOf(steps: Step[]): Set<Resource> {
  const used = new Set<Resource>();

  forEachStep(steps, (s) => {
    if (s.kind === 'do') s.holds.forEach((r) => used.add(r));

    if (s.kind === 'say') used.add('voice');
  });

  return used;
}

function checkTogether(ctx: CompileContext, step: TogetherStep) {
  const sets = step.branches.map(resourcesOf);

  sets.forEach((a, i) =>
    sets.slice(i + 1).forEach((b) => {
      const shared = [...a].filter((r) => b.has(r));

      if (shared.length) ctx.fail('resource-conflict', `Two branches both hold ${shared[0]}.`, ctx.nodeOf(step));
    }),
  );
}

function checkResources(ctx: CompileContext) {
  const baseHolds = new Set(ctx.routine.base.holds);

  for (const r of ctx.routine.reactions) {
    const shared = [...resourcesOf(r.steps)].filter((x) => baseHolds.has(x));

    if (r.body === 'keepGoing' && shared.length) {
      ctx.fail('resource-conflict', `${r.id} keeps going, but the base already holds ${shared[0]}.`, r.id);
    }
  }

  forEachStep([ctx.routine.base, ...ctx.routine.reactions.flatMap((r) => r.steps)], (s) => {
    if (s.kind === 'together') checkTogether(ctx, s);
  });
}

function checkBase(ctx: CompileContext) {
  const safe = ctx.skills.get(ctx.routine.safeStop);

  if (!safe || safe.status !== 'ready') {
    ctx.fail('unknown-skill', `There’s no ready ${ctx.routine.safeStop} skill to stop safely.`, 'safeStop');
  } else if (safe.stopVia !== safe.id) {
    ctx.fail('unsafe-safe-stop', `${safe.id} isn’t a stop: it hands off to ${safe.stopVia}.`, 'safeStop');
  }

  for (const skill of ctx.skills.values()) {
    if (!ctx.skills.has(skill.stopVia)) ctx.fail('unknown-skill', `${skill.id} stops via a missing skill.`, skill.id);
  }
}

const MOVERS = ['legs', 'wheels', 'arms'] as const;

function checkMovers(ctx: CompileContext) {
  let movesBody = false;

  forEachStep([ctx.routine.base, ...ctx.routine.reactions.flatMap((r) => r.steps)], (s) => {
    movesBody ||= s.kind === 'do' && s.holds.includes('body');
  });

  if (movesBody && !MOVERS.some((m) => ctx.routine.requires.includes(m))) {
    ctx.fail('missing-capability', 'This Routine moves the body. Add legs, wheels or arms to what it needs.');
  }
}

function checkCapabilities(ctx: CompileContext) {
  const has = ctx.options.capabilities;

  checkMovers(ctx);

  if (!has) return;

  for (const need of ctx.routine.requires) {
    if (!has.includes(need)) ctx.fail('missing-capability', `This robot has no ${need}. Add one to run this.`);
  }
}

export function checkRoutine(ctx: CompileContext) {
  forEachStep([ctx.routine.base, ...ctx.routine.reactions.flatMap((r) => r.steps)], (s) => checkStep(ctx, s));
  checkWatchers(ctx);
  ctx.routine.reactions.forEach((r) => checkReaction(ctx, r));
  checkResources(ctx);
  checkBase(ctx);
  checkCapabilities(ctx);
}
