import { describe, expect, it, vi } from 'vitest';
import { runSimTool, SIM_TOOL_KINDS, type SimToolContext } from './agentRobotTools';

describe('the agent’s body fitting tool', () => {
  it('uses the shared body action and returns its evidence unchanged', async () => {
    const fitBody = vi.fn(async () => '6.88° with the preset, 2.29° with the fit.');
    const setAction = vi.fn();
    const context = { fitBody, setAction } as unknown as SimToolContext;

    expect(SIM_TOOL_KINDS).toContain('fit_body');
    expect(await runSimTool('fit_body', { robot: 'arm' }, context)).toEqual({
      text: '6.88° with the preset, 2.29° with the fit.',
    });
    expect(fitBody).toHaveBeenCalledWith('arm');
    expect(setAction).toHaveBeenCalledWith('Fitting body');
  });

  it('passes no robot override when the payload omits it', async () => {
    const fitBody = vi.fn(async () => 'Can’t tell.');
    const context = { fitBody, setAction: vi.fn() } as unknown as SimToolContext;

    expect((await runSimTool('fit_body', {}, context)).text).toBe('Can’t tell.');
    expect(fitBody).toHaveBeenCalledWith(undefined);
  });
});
