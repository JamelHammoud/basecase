import { describe, expect, it } from 'vitest';
import {
  compileRoutine,
  generateScenarios,
  greetingRoutine,
  mutate,
  planHash,
  runScenario,
} from '../../src/routines/testing';

const REPEATS = 1000;
const MUTANTS = 200;
const MIN_CAUGHT = 0.95;

const compiled = () => {
  const r = compileRoutine(greetingRoutine());

  if (!r.ok) throw new Error(JSON.stringify(r.errors));

  return r.plan;
};

async function passesAll(plan: ReturnType<typeof compiled>) {
  for (const s of generateScenarios(plan)) {
    const r = await runScenario(plan, s);

    if (!r.passed) return false;
  }

  return true;
}

describe('the greeting Routine', () => {
  it('compiles and passes every generated scenario', async () => {
    const plan = compiled();
    const scenarios = generateScenarios(plan);

    expect(scenarios.length).toBeGreaterThanOrEqual(4);
    expect(new Set(scenarios.map((s) => s.covers)).size).toBeGreaterThanOrEqual(4);
    expect(await passesAll(plan)).toBe(true);
  });

  it('keeps walking while a slow model runs, and a hung LLM cannot stall control', async () => {
    const plan = compiled();
    const r = await runScenario(plan, {
      covers: 'hung remote node',
      world: [{ at: 1, fact: 'person', value: true }],
      mocks: { recognize: 'known' },
      faults: [{ node: 'ask', at: 1, kind: 'hang' }],
      seconds: 90,
      expect: [{ always: { skill: 'walk' }, until: 1 }],
    });

    expect(r.maxControlGapMs).toBeLessThanOrEqual(20);
    expect(r.controlTicks).toBeGreaterThan(4000);
  });

  it('never says a name for a stranger', async () => {
    const plan = compiled();
    const r = await runScenario(plan, {
      covers: 'stranger',
      world: [{ at: 1, fact: 'person', value: true }],
      mocks: { recognize: 'unknown' },
      faults: [],
      seconds: 20,
      expect: [],
    });

    expect(r.said.some((s) => /hello/i.test(s))).toBe(true);
    expect(r.said.some((s) => /maya/i.test(s))).toBe(false);
  });
});

describe('the compiler refuses unsafe graphs', () => {
  const broken = (edit: (r: ReturnType<typeof greetingRoutine>) => void) => {
    const r = structuredClone(greetingRoutine());

    edit(r);

    return compileRoutine(r);
  };

  it('a step with no timeout', () => {
    const r = broken((x) => {
      const step = x.reactions[0].steps.find((s) => s.kind === 'say') as { timeoutMs?: number };

      delete step.timeoutMs;
    });

    expect(r.ok).toBe(false);
    expect(r.errors?.some((e) => e.code === 'missing-timeout')).toBe(true);
  });

  it('two holders of the same resource', () => {
    const r = broken((x) => {
      x.reactions[0].steps.unshift({
        kind: 'together',
        branches: [
          [{ kind: 'do', skill: 'wave', holds: ['body'], timeoutMs: 1000, onTimeout: [], onFail: [] }],
          [{ kind: 'do', skill: 'walk', holds: ['body'], timeoutMs: 1000, onTimeout: [], onFail: [] }],
        ],
        join: 'all',
      });
    });

    expect(r.errors?.some((e) => e.code === 'resource-conflict')).toBe(true);
  });

  it('a skill transition not proven in sim', () => {
    const r = compileRoutine(greetingRoutine(), { provenTransitions: [] });

    expect(r.errors?.some((e) => e.code === 'unproven-transition')).toBe(true);
  });

  it('a Routine from the future, and hostile input', () => {
    expect(compileRoutine({ schema: 999 } as never).ok).toBe(false);
    expect(compileRoutine('<script>' as never).ok).toBe(false);
  });
});

describe('determinism', () => {
  it(`${REPEATS} reruns of a scenario are byte-identical, and the plan hash is stable`, async () => {
    const plan = compiled();
    const scenario = generateScenarios(plan)[0];
    const first = JSON.stringify((await runScenario(plan, scenario)).trace);

    for (let i = 0; i < REPEATS; i++) {
      const again = JSON.stringify((await runScenario(plan, scenario)).trace);

      if (again !== first) throw new Error(`Run ${i} differed`);
    }

    expect(planHash(plan)).toBe(planHash(compiled()));
  });
});

describe('scenario tests catch broken Routines', () => {
  it(`catches at least ${MIN_CAUGHT * 100}% of ${MUTANTS} seeded mutants`, async () => {
    const plan = compiled();
    const scenarios = generateScenarios(plan);
    let caught = 0;

    for (let seed = 0; seed < MUTANTS; seed++) {
      const mutant = compileRoutine(mutate(greetingRoutine(), seed));

      if (!mutant.ok) {
        caught++;

        continue;
      }

      for (const s of scenarios) {
        const r = await runScenario(mutant.plan, s);

        if (!r.passed) {
          caught++;

          break;
        }
      }
    }

    expect(caught / MUTANTS).toBeGreaterThanOrEqual(MIN_CAUGHT);
  });
});
