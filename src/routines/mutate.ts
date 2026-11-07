import type { Condition, GuardedStep, Routine, Step } from './schema';
import { allSteps, isGuarded } from './schema';

type Pick = (n: number) => number;

type Mutator = (r: Routine, pick: Pick) => boolean;

const of = <T>(items: T[], pick: Pick): T | undefined => (items.length ? items[pick(items.length)] : undefined);

function lcg(seed: number): Pick {
  let state = (seed * 2654435761 + 1013904223) >>> 0;

  return (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state % n;
  };
}

const guarded = (r: Routine) => allSteps(r).filter(isGuarded);
const ofKind = <K extends Step['kind']>(r: Routine, kind: K) =>
  allSteps(r).filter((s): s is Extract<Step, { kind: K }> => s.kind === kind);

function thresholds(r: Routine): Extract<Condition, { atLeast: number } | { atMost: number }>[] {
  const found: Extract<Condition, { atLeast: number } | { atMost: number }>[] = [];
  const walk = (c: Condition) => {
    if ('atLeast' in c || 'atMost' in c) found.push(c);
    else if ('all' in c) c.all.forEach(walk);
    else if ('any' in c) c.any.forEach(walk);
    else if ('not' in c) walk(c.not);
  };

  ofKind(r, 'if').forEach((s) => walk(s.test));

  return found;
}

function scale(c: Extract<Condition, { atLeast: number } | { atMost: number }>, factor: number) {
  if ('atLeast' in c) c.atLeast = Math.min(0.99, Math.round(c.atLeast * factor * 100) / 100);
  else c.atMost = Math.round(c.atMost * factor * 100) / 100;
}

function retime(r: Routine, pick: Pick, factor: number): boolean {
  const step = of(guarded(r), pick);

  if (step) step.timeoutMs = Math.round(step.timeoutMs * factor);

  return !!step;
}

function dropField(r: Routine, pick: Pick, field: 'timeoutMs' | 'onFail'): boolean {
  const step = of(guarded(r), pick) as Partial<GuardedStep> | undefined;

  if (step) delete step[field];

  return !!step;
}

function rescale(r: Routine, pick: Pick, factor: number): boolean {
  const leaf = of(thresholds(r), pick);

  if (leaf) scale(leaf, factor);

  return !!leaf;
}

const MUTATORS: Mutator[] = [
  (r, p) => dropField(r, p, 'timeoutMs'),
  (r, p) => dropField(r, p, 'onFail'),
  (r, p) => {
    const s = of(ofKind(r, 'if'), p);

    if (s) [s.then, s.else] = [s.else, s.then];

    return !!s;
  },
  (r, p) => rescale(r, p, 0.5),
  (r, p) => rescale(r, p, 1.5),
  (r, p) => {
    const reaction = of(r.reactions, p);
    const leaf = reaction && 'is' in reaction.when ? reaction.when : undefined;

    if (leaf && typeof leaf.is === 'boolean') leaf.is = !leaf.is;

    return !!leaf;
  },
  (r, p) => r.reactions.length > 0 && !!r.reactions.splice(p(r.reactions.length), 1),
  (r) => r.reactions.length > 1 && !!r.reactions.reverse(),
  (r, p) => {
    const reaction = of(
      r.reactions.filter((x) => x.steps.length > 1),
      p,
    );

    return !!reaction && !!reaction.steps.splice(p(reaction.steps.length), 1);
  },
  (r, p) => {
    const reaction = of(r.reactions, p);
    const i = reaction ? reaction.steps.findIndex((s) => s.kind === 'say') : -1;

    if (!reaction || i < 0) return false;

    const copy = structuredClone(reaction.steps[i]);

    copy.id = `${copy.id ?? 'say'}Again`;
    reaction.steps.splice(i, 0, copy);

    return true;
  },
  (r, p) => {
    const says = ofKind(r, 'say');
    const step = of(says, p);
    const other =
      step &&
      of(
        [...new Set(says.map((s) => s.text))].filter((t) => t !== step.text),
        p,
      );

    if (step && other) step.text = other;

    return !!other;
  },
  (r, p) => {
    const reaction = of(r.reactions, p);

    if (reaction) reaction.cooldownMs = 0;

    return !!reaction;
  },
  (r, p) => {
    const reaction = of(r.reactions, p);

    if (reaction) reaction.cooldownMs *= 3;

    return !!reaction;
  },
  (r, p) => {
    const reaction = of(r.reactions, p);

    if (reaction) reaction.body = reaction.body === 'keepGoing' ? 'stopFirst' : 'keepGoing';

    return !!reaction;
  },
  (r, p) => {
    const reaction = of(r.reactions, p);
    const modes = ['ignore', 'restart', 'queue'] as const;

    if (reaction) reaction.onRetrigger = modes[(modes.indexOf(reaction.onRetrigger) + 1 + p(2)) % 3];

    return !!reaction;
  },
  (r) => {
    r.base.skill = r.base.skill === 'wave' ? 'turn-away' : 'wave';

    return true;
  },
  (r) => {
    r.base.timeoutMs = Math.round(r.base.timeoutMs / 10);

    return true;
  },
  (r) => {
    r.base.timeoutMs *= 10;

    return true;
  },
  (r, p) => {
    const w = of(r.watchers, p);

    if (w) w.rateHz /= 2;

    return !!w;
  },
  (r, p) => {
    const w = of(r.watchers, p);

    if (w) w.maxAgeMs *= 20;

    return !!w;
  },
  (r, p) => {
    const w = of(r.watchers, p);

    if (w) w.publishes.type = 'number';

    return !!w;
  },
  (r, p) => retime(r, p, 0.1),
  (r, p) => retime(r, p, 10),
  (r, p) => {
    const ask = of(ofKind(r, 'ask'), p);

    return !!ask && !!ask.answers.splice(p(ask.answers.length), 1);
  },
  (r, p) => {
    const step = of(
      ofKind(r, 'do').filter((s) => s.holds.includes('body')),
      p,
    );

    if (step) step.skill = step.skill === 'wave' ? 'turn-away' : 'wave';

    return !!step;
  },
  (r, p) => {
    const step = of(ofKind(r, 'do'), p);

    if (step) step.holds = step.holds.includes('body') ? ['head'] : ['body'];

    return !!step;
  },
  (r) => {
    r.safeStop = r.base.skill;

    return true;
  },
  (r, p) => {
    const step = of(
      guarded(r).filter((s) => s.onTimeout.length + s.onFail.length > 0),
      p,
    );

    if (step) [step.onTimeout, step.onFail] = [[], []];

    return !!step;
  },
  (r, p) => {
    const step = of(ofKind(r, 'together'), p);

    if (step) step.join = step.join === 'all' ? 'any' : 'all';

    return !!step;
  },
  (r, p) => r.watchers.length > 0 && !!r.watchers.splice(p(r.watchers.length), 1),
  (r, p) => r.requires.length > 0 && !!r.requires.splice(p(r.requires.length), 1),
  (r, p) => {
    const reaction = of(r.reactions, p);
    const leaf = reaction && 'fact' in reaction.when ? reaction.when : undefined;
    const other =
      leaf &&
      of(
        r.watchers.filter((w) => w.id !== leaf.fact),
        p,
      );

    if (leaf && other) leaf.fact = other.id;

    return !!other;
  },
  (r, p) => {
    const step = of(
      ofKind(r, 'if').filter((s) => s.else.length > 0),
      p,
    );

    if (step) step.else = [];

    return !!step;
  },
];

export const MUTATOR_COUNT = MUTATORS.length;

export function mutate(routine: Routine, seed: number): Routine {
  for (let attempt = 0; attempt < MUTATORS.length; attempt++) {
    const copy = structuredClone(routine);
    const index = (seed + attempt) % MUTATORS.length;
    const pick = lcg(Math.floor(seed / MUTATORS.length) * 31 + index);

    if (MUTATORS[index](copy, pick)) return copy;
  }

  return structuredClone(routine);
}
