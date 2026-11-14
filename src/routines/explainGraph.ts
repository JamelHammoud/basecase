import { findNode } from './nodes';
import type { Condition, Reaction, Routine, Step } from './schema';

const quote = (text: string) => `“${text}”`;

function duration(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;

  return `${Math.round(ms / 100) / 10} s`;
}

export function describeCondition(cond: Condition): string {
  if ('all' in cond) return cond.all.map(describeCondition).join(' and ');

  if ('any' in cond) return cond.any.map(describeCondition).join(' or ');

  if ('not' in cond) return `not (${describeCondition(cond.not)})`;

  if ('atLeast' in cond) return `${cond.fact} is at least ${cond.atLeast}`;

  if ('atMost' in cond) return `${cond.fact} is at most ${cond.atMost}`;

  if (cond.is === true) return `${cond.fact} is seen`;

  if (cond.is === false) return `${cond.fact} isn’t seen`;

  return `${cond.fact} is ${cond.is}`;
}

function describeSteps(steps: Step[]): string {
  return steps.map(describeStep).join(', then ');
}

function failure(step: Extract<Step, { timeoutMs: number }>): string {
  const parts = [
    step.onTimeout.length ? `if it takes over ${duration(step.timeoutMs)}, ${describeSteps(step.onTimeout)}` : '',
    step.onFail.length ? `if it fails, ${describeSteps(step.onFail)}` : '',
  ].filter(Boolean);

  return parts.length ? ` (${parts.join('; ')})` : '';
}

function doWords(step: Extract<Step, { kind: 'do' }>): string {
  const move = step.move;

  if (move?.distance !== undefined) return `drive ${move.distance} m`;

  if (move?.turn !== undefined) return `turn ${Math.abs(move.turn)}° ${move.turn >= 0 ? 'left' : 'right'}`;

  return step.skill;
}

function describeStep(step: Step): string {
  switch (step.kind) {
    case 'do':
      return `${doWords(step)}${failure(step)}`;
    case 'say':
      return `say ${quote(step.text)}${failure(step)}`;
    case 'infer':
      return `${(findNode(step.model)?.label ?? step.model).toLowerCase()}${failure(step)}`;
    case 'ask':
      return `ask ${quote(step.prompt)} (${step.answers.join(' or ')})${failure(step)}`;
    case 'wait':
      return `wait ${step.until ? `until ${describeCondition(step.until)}` : duration(step.ms ?? 0)}`;
    case 'if':
      return [
        `if ${describeCondition(step.test)}, ${describeSteps(step.then) || 'carry on'}`,
        step.else.length ? `otherwise ${describeSteps(step.else)}` : '',
      ]
        .filter(Boolean)
        .join('; ');
    default:
      return `at the same time ${step.branches.map(describeSteps).join(' and ')}`;
  }
}

function describeReaction(r: Reaction): string {
  const body = r.body === 'stopFirst' ? 'stop first, then ' : '';
  const rest = r.cooldownMs > 0 ? ` Waits ${duration(r.cooldownMs)} before doing it again.` : '';

  return `When ${describeCondition(r.when)}: ${body}${describeSteps(r.steps)}.${rest}`;
}

export function describeRoutine(routine: Routine): string[] {
  const base = routine.base;
  const ending = base.onTimeout.length ? `, then ${describeSteps(base.onTimeout)}` : '';

  return [
    `Keeps doing ${base.skill} for up to ${duration(base.timeoutMs)}${ending}, then stops with ${routine.safeStop}.`,
    ...routine.watchers.map((w) => `Watches for ${w.id} ${w.rateHz} times a second.`),
    ...routine.reactions.map(describeReaction),
  ];
}
