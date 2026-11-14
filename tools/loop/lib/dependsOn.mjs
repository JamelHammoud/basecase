import { similarTitle } from './titles.mjs';

const DEPENDS = /Depends on\*{0,2}([^\n]*)/gi;
const QUOTED = /"([^"]+)"/g;
const NUMBER = /#(\d+)/g;

export const STUCK_DECLINES = 3;

const plain = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const dependsSentences = (body) =>
  [...String(body ?? '').matchAll(DEPENDS)].map((match) => match[1].replace(/\([^)]*\)/g, '').split(/\.(?:\s|$)/)[0]);

export const dependencies = (body) =>
  dependsSentences(body).flatMap((sentence) => [...sentence.matchAll(QUOTED)].map((quoted) => quoted[1]));

export const dependencyNumbers = (body) =>
  dependsSentences(body).flatMap((sentence) =>
    [...sentence.replace(QUOTED, '').matchAll(NUMBER)].map((match) => Number(match[1])),
  );

const names = (title, dependency) => plain(title).startsWith(plain(dependency)) || similarTitle(title, dependency);

export function blockers(step, openSteps) {
  const titles = dependencies(step.body);
  const numbers = new Set(dependencyNumbers(step.body));

  return openSteps.filter(
    (other) =>
      other.number !== step.number &&
      (numbers.has(other.number) || titles.some((dependency) => names(other.title, dependency))),
  );
}

export const waitsOn = (step, openSteps, { stuck = () => false } = {}) =>
  blockers(step, openSteps).some((other) => !stuck(other.number));

function dependentsOf(steps) {
  const dependents = new Map();

  for (const step of steps) {
    for (const blocker of blockers(step, steps)) {
      dependents.set(blocker.number, [...(dependents.get(blocker.number) ?? []), step]);
    }
  }

  return dependents;
}

function leadOf(step, { dependents, compare }) {
  const seen = new Set([step.number]);
  const pending = [step];
  let lead = step;

  while (pending.length > 0) {
    for (const dependent of dependents.get(pending.pop().number) ?? []) {
      if (seen.has(dependent.number)) continue;

      seen.add(dependent.number);
      pending.push(dependent);
      lead = compare(dependent, lead) < 0 ? dependent : lead;
    }
  }

  return lead;
}

export function buildOrder(steps, { compare, openSteps, stuck }) {
  const dependents = dependentsOf(steps);
  const lead = new Map(steps.map((step) => [step.number, leadOf(step, { dependents, compare })]));

  return steps
    .filter((step) => !waitsOn(step, openSteps, { stuck }))
    .sort((a, b) => compare(lead.get(a.number), lead.get(b.number)) || compare(a, b));
}
