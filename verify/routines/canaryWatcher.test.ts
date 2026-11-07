import { describe, expect, it } from 'vitest';
import { compileRoutine, generateScenarios, greetingRoutine, runScenario } from '../../src/routines/testing';
import { ACCEPTANCE, acceptanceProblems } from './acceptance';

function deafRoutine() {
  const routine = structuredClone(greetingRoutine());
  const person = routine.watchers.find((w) => w.id === 'person');

  if (person) person.when = { all: [{ fact: 'obstacle', is: true }, { not: { fact: 'obstacle', is: true } }] };

  return routine;
}

describe('canary: a Routine whose person watcher never fires', () => {
  it('claims to pass its scenarios, and must not', async () => {
    const compiled = compileRoutine(deafRoutine());

    if (!compiled.ok) return;

    const problems: string[] = [];

    for (const s of generateScenarios(compiled.plan)) {
      const r = await runScenario(compiled.plan, s);

      if (!r.passed) problems.push(`${s.covers}: ${r.failures.join('; ')}`);
    }

    for (const a of ACCEPTANCE) problems.push(...acceptanceProblems(a, await runScenario(compiled.plan, a.scenario)));

    expect(problems).toEqual([]);
  });
});
