import { describe, expect, it, vi } from 'vitest';
import { ROUTINE_HANDLERS, scenarioFrom } from './agentRoutineRequests';
import type { Routines } from './useRoutines';

describe('Routine scenario entry point', () => {
  it('preserves a requested L2 tier through the agent run entry point', async () => {
    const runHeadless = vi.fn(async () => ({ started: true, passed: true }));
    const routines = { runHeadless } as unknown as Routines;

    await ROUTINE_HANDLERS.run_routine({ scenario: { tier: 'L2', seconds: 2 } }, { routines, setAction: vi.fn() });

    expect(runHeadless).toHaveBeenCalledWith(expect.objectContaining({ tier: 'L2', seconds: 2, mocks: {} }));
  });

  it('keeps the existing duration bound and refuses unknown tier names', () => {
    expect(scenarioFrom({ tier: 'L2', seconds: 1000 })).toMatchObject({ tier: 'L2', seconds: 60 });
    expect(scenarioFrom({ tier: 'render-later' }).tier).toBeUndefined();
  });
});
