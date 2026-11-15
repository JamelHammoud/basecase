import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sh.mjs', () => ({ run: vi.fn(), json: vi.fn() }));

import { createPull, editPull } from './github.mjs';
import { run } from './sh.mjs';

beforeEach(() => vi.clearAllMocks());

const ok = { ok: true, out: 'https://github.com/example/basecase/pull/719', err: '' };

describe('runner-owned step labels', () => {
  it('creates the step label when GitHub reports it missing, then publishes with it', () => {
    run
      .mockReturnValueOnce({ ok: false, err: "could not add label: 'loop:step:605' not found" })
      .mockReturnValueOnce(ok)
      .mockReturnValueOnce(ok);

    expect(
      createPull({
        branch: 'loop/rebuild/import',
        title: 'Refine: Import',
        body: 'Closes #605.',
        label: 'loop:refine',
      }),
    ).toBe(ok.out);
    expect(run.mock.calls[0][1]).toEqual(expect.arrayContaining(['--label', 'loop:step:605']));
    expect(run.mock.calls[1][1]).toEqual(['label', 'create', 'loop:step:605', '--color', '6e7781', '--force']);
    expect(run.mock.calls[2][1]).toEqual(run.mock.calls[0][1]);
  });

  it('keeps steps in labels when rewriting the body and backfills old build branches on creation', () => {
    run.mockReturnValue(ok);
    editPull(719, { body: 'Closes #605.\nCloses #606.' });

    expect(run.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['--add-label', 'loop:step:605', '--add-label', 'loop:step:606']),
    );
    createPull({ branch: 'loop/build/410-1-quote', title: 'Refine: Quote', body: 'Summary', label: 'loop:refine' });
    expect(run.mock.calls[1][1]).toEqual(expect.arrayContaining(['--label', 'loop:step:410']));
  });
});
