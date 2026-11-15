import { expect, it, vi } from 'vitest';
import { compileRoutine } from './compile';
import { FIXTURE_SKILLS } from './fixtureSkills';
import { greetingRoutine } from './greeting';
import { runScenario } from './scenario';

it('runs asynchronous L2 replies through the exact scenario end between control ticks', async () => {
  const routine = greetingRoutine();

  routine.watchers = [];
  routine.reactions = [];
  routine.base.timeoutMs = 100;
  routine.base.onTimeout = [
    {
      kind: 'ask',
      id: 'reply',
      prompt: 'Continue?',
      answers: ['yes', 'no'],
      timeoutMs: 1000,
      onTimeout: [],
      onFail: [],
    },
  ];

  const compiled = compileRoutine(routine, { skills: FIXTURE_SKILLS });
  const sample = vi.fn(async () => []);

  expect(compiled.ok).toBe(true);

  const result = await runScenario(
    compiled.plan!,
    {
      tier: 'L2',
      covers: 'L2 duration between control ticks',
      world: [],
      mocks: { reply: { value: 'yes', ms: 215 } },
      faults: [],
      seconds: 0.315,
      expect: [{ event: 'answered', node: 'reply', count: 1 }],
    },
    { sample },
  );

  expect(result.failures).toEqual([]);
  expect(result.trace).toContainEqual(expect.objectContaining({ kind: 'answered', node: 'reply', t: 315 }));
  expect(result.controlTicks).toBe(16);
  expect(sample).not.toHaveBeenCalled();
});
