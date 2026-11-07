import { describe, expect, it } from 'vitest';
import { compileRoutine, greetingRoutine, runScenario } from '../../src/routines/testing';
import { ACCEPTANCE, acceptanceProblems, SENTENCE } from './acceptance';

describe('acceptance scenarios written from the sentence, not from the plan', () => {
  it('the greeting Routine says what the sentence asks for', async () => {
    const routine = greetingRoutine();
    const compiled = compileRoutine(routine);

    expect(routine.sentence).toBe(SENTENCE);

    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

    const problems: string[] = [];

    for (const a of ACCEPTANCE) problems.push(...acceptanceProblems(a, await runScenario(compiled.plan, a.scenario)));

    expect(problems).toEqual([]);
  });
});
