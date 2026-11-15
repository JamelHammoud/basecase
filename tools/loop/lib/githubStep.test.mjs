import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sh.mjs', () => ({ run: vi.fn(), json: vi.fn() }));

import { createPull, editPull } from './github.mjs';
import { run } from './sh.mjs';

beforeEach(() => vi.clearAllMocks());

const ok = { ok: true, out: 'https://github.com/example/basecase/pull/719', err: '' };

describe('runner-owned step labels', () => {
  it.each(['create', 'edit'])('can %s a pull request whose four step labels are all new', (operation) => {
    const created = new Set();
    const labels = [605, 606, 607, 608].map((step) => `loop:step:${step}`);

    run.mockImplementation((command, args) => {
      if (args[0] === 'label') {
        created.add(args[2]);

        return ok;
      }

      const missing = labels.find((label) => !created.has(label));

      return missing ? { ok: false, err: `could not add label: '${missing}' not found` } : ok;
    });

    const body = [605, 606, 607, 608].map((step) => `Closes #${step}.`).join('\n');
    const publish = () =>
      createPull({ branch: 'loop/rebuild/import', title: 'Refine: Import', body, label: 'loop:refine' });

    expect(operation === 'create' ? publish() : editPull(719, { body })).toBe(ok.out);
    expect([...created]).toEqual(labels);
    expect(run).toHaveBeenCalledTimes(9);
  });

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

  it.each([
    ["could not add label: 'loop:step:605' not found", 3],
    ['HTTP 403: permission denied', 1],
    ["could not add label: 'loop:step:999' not found", 1],
  ])('stops label recovery on an unresolved error: %s', (err, calls) => {
    run.mockImplementation((command, args) => (args[0] === 'label' ? ok : { ok: false, err }));

    expect(() => editPull(719, { body: 'Closes #605.' })).toThrow('gh pr edit failed');
    expect(run).toHaveBeenCalledTimes(calls);
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
