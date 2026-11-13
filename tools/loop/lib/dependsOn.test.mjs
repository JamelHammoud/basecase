import { describe, expect, it } from 'vitest';
import { buildOrder, dependencies, dependencyNumbers, STUCK_DECLINES, waitsOn } from './dependsOn.mjs';

const runtime = {
  number: 482,
  title: 'Run a Case’s own code as panels and canvas overlays, sandboxed, reading every signal',
  body: 'Request: #480',
};
const authoring = {
  number: 483,
  title: 'Let the agent write and revise a Case’s code from the composer',
  body: 'Request: #480\n\n**Depends on** "Run a Case\'s own code as panels and canvas overlays" (same arc). Build on main once it lands.',
};

describe('steps that depend on another step', () => {
  it('reads the quoted titles a step depends on', () => {
    expect(dependencies(authoring.body)).toEqual(["Run a Case's own code as panels and canvas overlays"]);
    expect(dependencies('Depends on "A step" and "Another step".')).toEqual(['A step', 'Another step']);
    expect(dependencies(runtime.body)).toEqual([]);
  });

  it('reads the step numbers on the Depends on line, outside asides and later sentences', () => {
    expect(dependencyNumbers('**Depends on** #150 (in review as #313) and #116 (seeded `runCase`). See #187.')).toEqual(
      [150, 116],
    );
    expect(dependencyNumbers('Arc: #224\n\nDepends on #19.')).toEqual([19]);
    expect(dependencyNumbers(authoring.body)).toEqual([]);
  });

  it('waits while the step it depends on is open, and builds once it is gone', () => {
    expect(waitsOn(authoring, [runtime, authoring])).toBe(true);
    expect(waitsOn(authoring, [authoring])).toBe(false);
    expect(waitsOn(runtime, [runtime, authoring])).toBe(false);
  });
});

const label = (...names) => names.map((name) => ({ name }));

const step = (number, { createdAt, priority = false, body = '' }) => ({
  number,
  title: `Step ${number}`,
  body,
  createdAt,
  labels: label('loop:next', ...(priority ? ['loop:priority'] : [])),
});

const priority = (s) => Number(s.labels.some((l) => l.name === 'loop:priority'));
const byPriorityThenAge = (a, b) => priority(b) - priority(a) || a.createdAt.localeCompare(b.createdAt);

describe('waitingSteps order', () => {
  const older = step(10, { createdAt: '2026-11-01' });
  const dependency = step(19, { createdAt: '2026-11-05' });
  const dependent = step(29, { createdAt: '2026-11-02', priority: true, body: 'Depends on #19.' });
  const steps = [older, dependency, dependent];

  it('builds a dependency first, in the place its dependent would take', () => {
    const order = buildOrder(steps, { compare: byPriorityThenAge, openSteps: steps, stuck: () => false });

    expect(order.map((s) => s.number)).toEqual([19, 10]);
  });

  it(`stops blocking once the dependency has been declined ${STUCK_DECLINES} times`, () => {
    const stuck = (number) => number === 19;
    const order = buildOrder(steps, { compare: byPriorityThenAge, openSteps: steps, stuck });

    expect(order.map((s) => s.number)).toEqual([29, 19, 10]);
  });
});
