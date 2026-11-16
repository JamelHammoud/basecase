import { afterEach, expect, it, vi } from 'vitest';
import { benchmarkSelection, benchmarkTurn } from './benchmarkPolicy.mjs';

const f = vi.hoisted(() => ({ primary: vi.fn(), reserve: vi.fn(), record: vi.fn(), held: vi.fn() }));

vi.mock('./agent.mjs', () => ({ primaryAllowed: f.primary }));
vi.mock('./quota.mjs', () => ({ reserveOverflow: f.reserve, quotaSnapshot: () => ({ at: 1, windows: [] }) }));
vi.mock('./sessionJournal.mjs', () => ({ recordSession: f.record }));
vi.mock('./usage.mjs', async (original) => ({ ...(await original()), pause: f.held }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it('selects the loop Codex policy and journals a nested turn without using Claude', async () => {
  vi.stubEnv('BASECASE_LOOP_PROVIDER', 'codex');
  vi.stubEnv('CODEX_MODEL', 'gpt-6.1-sol');
  vi.stubEnv('CODEX_EFFORT', 'medium');
  f.primary.mockReturnValue(true);
  f.record.mockReturnValue('turn');

  const selection = benchmarkSelection();

  expect(selection).toEqual({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'medium' });
  await benchmarkTurn(selection, async () => ({
    result: { usage: { inputTokens: 12, cachedReadTokens: 8, outputTokens: 2 } },
  }));
  expect(f.reserve).not.toHaveBeenCalled();
  expect(f.record).toHaveBeenLastCalledWith(
    expect.objectContaining({
      provider: 'codex',
      state: 'completed',
      usage: { input_tokens: 12, cache_read_input_tokens: 8, output_tokens: 2, cache_creation_input_tokens: 0 },
      ok: true,
      durationMs: expect.any(Number),
    }),
  );
});

it('refuses protected overflow and never starts the nested prompt', async () => {
  f.primary.mockReturnValue(false);
  f.reserve.mockReturnValue(null);

  const execute = vi.fn();

  expect(() => benchmarkSelection()).toThrow('usage limit');
  await expect(benchmarkTurn({ provider: 'codex' }, execute)).rejects.toMatchObject({ code: 'allowance' });
  await expect(benchmarkTurn({ provider: 'claude' }, execute)).rejects.toMatchObject({ code: 'allowance' });
  expect(execute).not.toHaveBeenCalled();
});

it('holds the existing overflow reservation until the nested prompt ends and releases on failure', async () => {
  const release = vi.fn();

  f.reserve.mockReturnValue(release);
  await expect(
    benchmarkTurn({ provider: 'claude' }, async () => {
      expect(release).not.toHaveBeenCalled();

      throw new Error('interrupted');
    }),
  ).rejects.toThrow('interrupted');
  expect(release).toHaveBeenCalledOnce();
  expect(f.record).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false, state: 'completed' }));
});

it('does not launch a prompt when allowance admission consumes the deadline', async () => {
  const release = vi.fn();
  const execute = vi.fn();

  f.reserve.mockReturnValue(release);
  await expect(benchmarkTurn({ provider: 'claude', deadline: Date.now() - 1 }, execute)).rejects.toMatchObject({
    code: 'deadline',
  });
  expect(execute).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
});
