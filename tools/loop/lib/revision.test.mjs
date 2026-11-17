import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  pages: vi.fn(),
  save: vi.fn((entry) => entry),
  deliver: vi.fn(),
}));

vi.mock('./sh.mjs', () => ({ run: mocks.run }));
vi.mock('./voiceHook.mjs', () => ({ voiceNewPages: mocks.pages, voiced: (body) => body }));
vi.mock('./deliveryState.mjs', () => ({ saveDelivery: mocks.save }));
vi.mock('./deliver.mjs', () => ({ deliver: mocks.deliver }));

const { publishRevision } = await import('./revision.mjs');
const pull = {
  number: 1713,
  title: 'Repair: Bound observations',
  body: '## Fix\n\nBound observations.\n\nCloses #42.',
  headRefName: 'loop/repair/observations',
  headRefOid: 'reviewed-head',
};
const output = {
  title: 'Bound observations',
  summary: 'Bound observations.',
  why: 'Change `.github/workflows/check.yml` to keep optional observations within the job budget.',
  checked: 'Focused checks pass.',
  screenshots: [],
  copy: [],
  commitMessage: 'Answer review\n\nPreserve the workflow rationale.',
  revision: 'Restate the workflow rationale.',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.run.mockImplementation((_command, args) => ({ ok: true, out: args[0] === 'rev-parse' ? 'merged-head' : '' }));
});

it('delivers corrected metadata on the reviewed head without committing or pushing merged main', () => {
  publishRevision(pull, { dir: 'fixture', output });

  const entry = mocks.save.mock.calls[0][0];

  expect(entry).toMatchObject({ number: 1713, sha: 'reviewed-head', metadataOnly: true });
  expect(entry.body).toContain(`## Why\n\n${output.why}`);
  expect(entry.body).toContain(output.revision);
  expect(entry.body).toContain('Closes #42.');
  expect(mocks.pages).not.toHaveBeenCalled();
  expect(mocks.run.mock.calls.map((call) => call[1][0])).not.toContain('commit');
  expect(mocks.run.mock.calls.map((call) => call[1][0])).not.toContain('push');
  expect(mocks.deliver).toHaveBeenCalledExactlyOnceWith(entry);
});

it('commits source changes and delivers the new verified head through the existing path', () => {
  mocks.run.mockImplementation((_command, args) => {
    if (args[0] === 'status') return { ok: true, out: ' M tools/loop/lanes/repair.mjs' };

    return { ok: true, out: args[0] === 'rev-parse' ? 'revised-head' : '' };
  });
  publishRevision(pull, { dir: 'fixture', output });

  expect(mocks.pages).toHaveBeenCalledExactlyOnceWith('fixture');
  expect(mocks.run.mock.calls.filter((call) => call[1][0] === 'commit')).toHaveLength(1);
  expect(mocks.run.mock.calls.some((call) => call[0] === 'node' && call[1][0].endsWith('check-credit.mjs'))).toBe(true);
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ sha: 'revised-head', metadataOnly: false });
  expect(mocks.deliver).toHaveBeenCalledOnce();
});
