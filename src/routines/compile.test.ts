import { describe, expect, it } from 'vitest';
import { compileRoutine, planHash } from './compile';
import { FIXTURE_SKILLS } from './fixtureSkills';
import { greetingRoutine } from './greeting';
import type { Routine } from './schema';

const compile = (routine: unknown, extra = {}) => compileRoutine(routine, { skills: FIXTURE_SKILLS, ...extra });

function codesAfter(edit: (r: Routine) => void, extra = {}): string[] {
  const routine = greetingRoutine();

  edit(routine);

  const r = compile(routine, extra);

  return r.ok ? [] : r.errors.map((e) => e.code);
}

describe('compileRoutine', () => {
  it('compiles the greeting to a flat plan that only jumps forward', () => {
    const r = compile(greetingRoutine());

    expect(r.ok).toBe(true);

    const plan = r.plan!;

    plan.ops.forEach((op, pc) => {
      for (const to of [op.next, op.onTimeout, op.onFail, op.then, op.else, ...(op.branches ?? [])]) {
        if (to !== undefined && to >= 0) expect(to).toBeGreaterThan(pc);
      }
    });
    expect(plan.hash).toBe(planHash(plan));
    expect(plan.transitions).toEqual(['settle->turn-away', 'settle->walk', 'turn-away->walk']);
  });

  it('gives the same hash for the same Routine, and a new one for any change', () => {
    const a = compile(greetingRoutine()).plan!;
    const changed = greetingRoutine();

    changed.reactions[1].cooldownMs += 1;

    expect(compile(greetingRoutine()).plan!.hash).toBe(a.hash);
    expect(compile(changed).plan!.hash).not.toBe(a.hash);
  });

  it('never throws on hostile input', () => {
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
      },
    );

    for (const input of [throwing, { schema: 1, base: throwing }, '<script>', { schema: 999 }]) {
      expect(compile(input).ok).toBe(false);
    }
  });

  it('refuses unsafe graphs with a reason', () => {
    expect(codesAfter((r) => (r.reactions[1].body = 'stopFirst'))).toEqual([]);
    expect(codesAfter((r) => (r.reactions[0].body = 'keepGoing'))).toContain('resource-conflict');
    expect(codesAfter(() => {}, { provenTransitions: [] })).toContain('unproven-transition');
    expect(codesAfter(() => {}, { modelHash: 'another-physics' })).toContain('unproven-transition');
    expect(codesAfter((r) => (r.reactions[1].cooldownMs = 1000))).toContain('unbounded-ask');
    expect(codesAfter((r) => (r.base.skill = 'backflip'))).toContain('needs-training');
    expect(codesAfter((r) => (r.base.skill = 'moonwalk'))).toContain('unknown-skill');
    expect(codesAfter((r) => (r.safeStop = 'walk'))).toContain('unsafe-safe-stop');
    expect(codesAfter((r) => (r.watchers[1].maxAgeMs = 50))).toContain('stale-by-design');
    expect(codesAfter((r) => (r.watchers[1].rateHz = 60))).toContain('rate-out-of-range');
    expect(codesAfter((r) => (r.requires = ['speaker', 'legs']))).toContain('missing-capability');
    expect(codesAfter(() => {}, { capabilities: ['speaker', 'legs'] })).toContain('missing-capability');
  });

  it('refuses saying a name that no If has checked', () => {
    const codes = codesAfter((r) => {
      const known = r.reactions[1].steps[1] as { then: unknown[]; else: unknown[] };

      [known.then, known.else] = [known.else, known.then];
    });

    expect(codes).toContain('unguarded-name');
  });

  it('refuses reading a model answer before the model runs', () => {
    const swapped = codesAfter((r) => r.reactions[1].steps.reverse());

    expect(swapped).toContain('use-before-set');
    expect(codesAfter((r) => r.reactions[1].steps.splice(0, 1))).toContain('unknown-fact');
  });

  it('refuses an Ask that retries itself or holds a resource', () => {
    const codes = codesAfter((r) => {
      const ask = r.reactions[1].steps[2] as { onTimeout: unknown[]; holds?: string[] };

      ask.onTimeout = [structuredClone(ask)];
      (ask.onTimeout[0] as { id: string }).id = 'askAgain';
      ask.holds = ['voice'];
    });

    expect(codes).toEqual(expect.arrayContaining(['unbounded-ask', 'ask-holds-resource']));
  });
});
