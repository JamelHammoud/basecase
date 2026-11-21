import { describe, expect, it, vi } from 'vitest';
import { dispatch } from '../lib/dispatch.mjs';
import ux, { AREAS, completeAudit, schedule } from './ux.mjs';

function world(output = {}) {
  const log = vi.fn();
  const deps = {
    inFlight: () => ({ open: [{ number: 9, title: 'Fix: Existing board work' }], merged: [] }),
    openBranch: vi.fn(() => ({ dir: 'worktree', branch: 'loop/ux/screens' })),
    close: vi.fn(),
    checkedRun: vi.fn(() => ({
      ok: true,
      output: {
        changed: true,
        checked: 'Browser geometry checks passed',
        audit: Object.fromEntries(AREAS.map((area) => [area, `${area} source and browser evidence`])),
        ...output,
      },
    })),
    publish: vi.fn(() => 'https://github.com/o/r/pull/10'),
  };

  return { log, deps };
}

describe('the daily UI and UX audit', () => {
  it.each([
    { openWaiting: 12, queuedRuns: 0, starts: false },
    { openWaiting: 0, queuedRuns: 20, starts: false },
    { openWaiting: 0, queuedRuns: 0, starts: true },
  ])('observes global producer limits with %j independently of the refinement queue', async (counts) => {
    const { log, deps } = world();

    await dispatch({
      lane: 'ux',
      module: { schedule, default: (context) => ux(context, deps) },
      context: { log },
      capacity: () => ({ sessions: 0, loadPerCore: 0 }),
      counts: () => ({ ...counts, byLane: { refine: 3 } }),
    });
    expect(deps.checkedRun).toHaveBeenCalledTimes(Number(counts.starts));
    expect(deps.openBranch).toHaveBeenCalledTimes(Number(counts.starts));
    expect(deps.publish).toHaveBeenCalledTimes(Number(counts.starts));
  });

  it('runs independently and requires evidence for every surface before publishing', () => {
    const { log, deps } = world();

    ux({ log }, deps);
    expect(schedule).toMatchObject({ agent: true, slots: 1, everySeconds: 86400 });
    expect(deps.checkedRun.mock.calls[0][0].prompt).toContain('#9');
    expect(deps.checkedRun.mock.calls[0][0].schema.properties.audit.required).toEqual(AREAS);
    expect(deps.publish).toHaveBeenCalledOnce();

    for (const area of AREAS) expect(deps.publish.mock.calls[0][0].checked).toContain(`${area} source`);

    expect(deps.close).toHaveBeenCalledOnce();
  });

  it.each([undefined, {}, { Build: 'Checked' }, Object.fromEntries(AREAS.map((area) => [area, ' ']))])(
    'rejects incomplete coverage %j',
    (audit) => {
      const { log, deps } = world({ audit });

      ux({ log }, deps);
      expect(completeAudit(audit)).toBe(false);
      expect(deps.publish).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('incomplete'));
      expect(deps.close).toHaveBeenCalledOnce();
    },
  );

  it('records complete audits without opening an empty pull request', () => {
    const { log, deps } = world({ changed: false, notes: 'No reproducible defect found' });

    ux({ log }, deps);
    expect(deps.publish).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('UI and UX audit: No reproducible defect found');
    expect(deps.close).toHaveBeenCalledOnce();
  });

  it('leaves a failed audit unsuccessful and cleans up', () => {
    const { log, deps } = world();

    deps.checkedRun.mockReturnValue({ ok: false, error: 'execution failed' });
    ux({ log }, deps);
    expect(deps.publish).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('UI and UX audit failed: execution failed');
    expect(deps.close).toHaveBeenCalledOnce();
  });

  it('does not duplicate an open audit', () => {
    const { log, deps } = world();

    deps.inFlight = () => ({ open: [{ number: 10, headRefName: 'loop/ux/screens' }], merged: [] });
    ux({ log }, deps);
    expect(deps.openBranch).not.toHaveBeenCalled();
    expect(deps.checkedRun).not.toHaveBeenCalled();
  });

  it('cleans up when publication fails', () => {
    const { log, deps } = world();

    deps.publish.mockImplementation(() => {
      throw new Error('publication failed');
    });
    expect(() => ux({ log }, deps)).toThrow('publication failed');
    expect(deps.close).toHaveBeenCalledOnce();
  });
});
