import { describe, expect, it } from 'vitest';
import { explainTrace } from './explain';
import { generateScenarios } from './generate';
import { runScenario } from './scenario';
import { compileRoutine, greetingRoutine } from './testing';

const plan = compileRoutine(greetingRoutine()).plan!;
const seen = (fact: string, at = 1) => ({ at, fact, value: true });

describe('runScenario on the greeting', () => {
  it('greets a known face by name while it keeps walking', async () => {
    const r = await runScenario(plan, {
      covers: 'known',
      world: [seen('person')],
      mocks: { recognize: 'known', ask: 'no' },
      faults: [],
      seconds: 10,
      expect: [{ saidExactly: ['Hello Maya'] }, { always: { skill: 'walk' } }],
    });

    expect(r.failures).toEqual([]);
    expect(explainTrace(plan, r.trace)).toContain(
      'Said Hello Maya at 1.2 s because Check Face matched 0.83 (needs 0.60)',
    );
  });

  it('flags a name said to a stranger, whatever the expectations say', async () => {
    const naming = greetingRoutine();
    const known = naming.reactions[1].steps[1] as { else: { text: string }[] };

    known.else[0].text = 'Hello Maya';

    const r = await runScenario(compileRoutine(naming).plan!, {
      covers: 'stranger',
      world: [seen('person')],
      mocks: { recognize: 'unknown' },
      faults: [],
      seconds: 5,
      expect: [],
    });

    expect(r.passed).toBe(false);
    expect(r.failures[0]).toMatch(/without recognising Maya/);
  });

  it('keeps control at 50 Hz while the remote model hangs', async () => {
    const r = await runScenario(plan, {
      covers: 'hung',
      world: [seen('person')],
      mocks: {},
      faults: [{ node: 'ask', at: 0, kind: 'hang' }],
      seconds: 40,
      expect: [{ event: 'opTimeout', node: 'ask', count: 1 }, { always: { skill: 'walk' } }],
    });

    expect(r.failures).toEqual([]);
    expect(r.maxControlGapMs).toBe(20);
    expect(r.controlTicks).toBe(2001);
  });

  it('stops safely in the control tier when the coordinator goes quiet', async () => {
    const r = await runScenario(plan, {
      covers: 'quiet',
      world: [],
      mocks: {},
      faults: [{ node: 'coordinator', at: 2, kind: 'hang' }],
      seconds: 4,
      expect: [{ event: 'tripped', count: 1 }, { skills: ['walk', 'settle'] }],
    });

    expect(r.failures).toEqual([]);
  });

  it('fails a scenario that faults a node the plan does not have', async () => {
    const r = await runScenario(plan, {
      covers: 'typo',
      world: [],
      mocks: {},
      faults: [{ node: 'nope', at: 0, kind: 'hang' }],
      seconds: 1,
      expect: [],
    });

    expect(r.failures).toEqual(['No node called nope to fault']);
  });
});

describe('generateScenarios', () => {
  it('covers every branch, timeout, failure, preemption and stop, and the greeting passes them all', async () => {
    const scenarios = generateScenarios(plan);
    const covers = scenarios.map((s) => s.covers);

    expect(new Set(covers).size).toBe(covers.length);

    for (const needed of [
      'greet: known is false',
      'greet: ask times out',
      'avoid: turnAway fails',
      'preempt greet with avoid',
      'coordinator hangs',
    ]) {
      expect(covers).toContain(needed);
    }

    for (const s of scenarios) expect((await runScenario(plan, s)).failures, s.covers).toEqual([]);
  });

  it('is deterministic', async () => {
    const s = generateScenarios(plan)[1];
    const a = JSON.stringify((await runScenario(plan, s)).trace);

    expect(JSON.stringify((await runScenario(plan, s)).trace)).toBe(a);
    expect(JSON.stringify(generateScenarios(plan))).toBe(JSON.stringify(generateScenarios(plan)));
  });
});
