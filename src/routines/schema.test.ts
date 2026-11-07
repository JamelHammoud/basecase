import { describe, expect, it } from 'vitest';
import { greetingRoutine } from './greeting';
import { validateRoutine } from './schema';

const codes = (input: unknown) => {
  const r = validateRoutine(input);

  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe('validateRoutine', () => {
  it('accepts the greeting Routine as plain data', () => {
    const routine = greetingRoutine();

    expect(validateRoutine(routine).ok).toBe(true);
    expect(JSON.parse(JSON.stringify(routine))).toEqual(routine);
  });

  it('refuses anything that is not a Routine object', () => {
    for (const input of [null, 'x', 7, [], undefined]) expect(codes(input)).toEqual(['not-a-routine']);
  });

  it('names a Routine from a newer version', () => {
    const r = validateRoutine({ ...greetingRoutine(), schema: 2 });

    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.errors[0].message).toMatch(/newer Basecase/);
  });

  it('needs a time limit and both failure paths on every guarded step', () => {
    const routine = greetingRoutine() as unknown as { reactions: { steps: Record<string, unknown>[] }[] };

    delete routine.reactions[0].steps[0].onTimeout;
    delete routine.reactions[1].steps[0].timeoutMs;

    expect(codes(routine)).toEqual(['missing-timeout', 'missing-timeout']);
  });

  it('stops at deep nesting instead of overflowing', () => {
    let cond: unknown = { fact: 'person', is: true };

    for (let i = 0; i < 50_000; i++) cond = { not: cond };

    const routine = { ...greetingRoutine(), watchers: [{ ...greetingRoutine().watchers[0], when: cond }] };

    expect(codes(routine)).toContain('too-large');
  });

  it('refuses wrong kinds, answers and resources', () => {
    const routine = greetingRoutine();
    const ask = routine.reactions[1].steps[2] as { answers: string[] };

    ask.answers = ['yes', 'yes'];
    (routine.base as { holds: string[] }).holds = ['legs'];
    routine.reactions[0].steps.push({ kind: 'jump' } as never);

    expect(codes(routine)).toEqual(['invalid-field', 'invalid-field', 'invalid-field']);
  });
});
