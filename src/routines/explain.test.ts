import { describe, expect, it } from 'vitest';
import { describeRoutine, explainTrace } from './explain';
import { runScenario } from './scenario';
import { compileRoutine, greetingRoutine } from './testing';

const plan = compileRoutine(greetingRoutine()).plan!;

async function explained(mocks: Record<string, string>, faults: { node: string; at: number; kind: 'hang' }[] = []) {
  const r = await runScenario(plan, {
    covers: 'explain',
    world: [{ at: 5, fact: 'person', value: true }],
    mocks,
    faults,
    seconds: 12,
    expect: [],
  });

  return explainTrace(plan, r.trace);
}

describe('explanations come from the trace, never from a model', () => {
  it('says why it greeted someone by name', async () => {
    const lines = await explained({ recognize: 'known', ask: 'yes' });

    expect(lines).toEqual([
      'Started greet at 5.0 s because See Person said yes',
      'Said Hello Maya at 5.2 s because Check Face matched 0.83 (needs 0.60)',
      'Said How can I help? at 7.7 s because Look and Answer answered yes',
    ]);
  });

  it('says why it greeted without a name', async () => {
    expect(await explained({ recognize: 'unknown', ask: 'no' })).toContain(
      'Said Hello at 5.2 s because Check Face scored 0.31 (needs 0.60)',
    );
    expect(await explained({}, [{ node: 'recognize', at: 0, kind: 'hang' }])).toContain(
      'Said Hello at 8.0 s because Check Face ran out of time after 3.0 s',
    );
  });

  it('describes the graph in plain English', () => {
    const lines = describeRoutine(greetingRoutine());

    expect(lines[0]).toBe('Keeps doing walk for up to 5 min, then say “I’m done walking”, then stops with settle.');
    expect(lines.at(-1)).toMatch(/^When person is seen: check face/);
  });
});
