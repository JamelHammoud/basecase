import { describe, expect, it, vi } from 'vitest';
import { ROUTINE_HANDLERS, scenarioFrom } from './agentRoutineRequests';
import type { Routines } from './useRoutines';

describe('Routine scenario tiers', () => {
  it('keeps explicit tiers and dispatches L2 through rendered live cameras', async () => {
    const runLive = vi.fn().mockResolvedValue({ started: true });
    const runHeadless = vi.fn().mockResolvedValue({ started: true, passed: true });
    const routines = { runLive, runHeadless } as unknown as Routines;
    const context = { routines, setAction: vi.fn() };

    await ROUTINE_HANDLERS.run_routine({ scenario: { tier: 'L2', seconds: 2 } }, context);
    expect(runLive).toHaveBeenCalledWith(expect.objectContaining({ tier: 'L2', seconds: 2 }));
    expect(runHeadless).not.toHaveBeenCalled();
    await ROUTINE_HANDLERS.run_routine({ scenario: { tier: 'L1' } }, context);
    await ROUTINE_HANDLERS.run_routine({ scenario: { tier: 'L0' } }, context);
    expect(runHeadless).toHaveBeenCalledWith(expect.objectContaining({ tier: 'L1' }));
    expect(runHeadless).toHaveBeenCalledWith(expect.objectContaining({ tier: 'L0' }));
    expect(scenarioFrom({}).tier).toBeUndefined();
  });
});
