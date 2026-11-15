import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), query: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mocks.query }));
vi.mock('./codexHome.mjs', () => ({ codexHome: () => ({ CODEX_HOME: 'isolated-profile', OPENAI_API_KEY: '' }) }));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('quota query subscription environment', () => {
  it('reads Codex quota with its isolated profile and subscription login', async () => {
    const stdout = new EventEmitter();
    const stdin = {
      write: (line) => {
        const request = JSON.parse(line);

        if (request.id === undefined) return;

        const result =
          request.id === 0
            ? {}
            : { rateLimits: { primary: { usedPercent: 10, windowDurationMins: 10080, resetsAt: 2_000_000_000 } } };

        queueMicrotask(() => stdout.emit('data', `${JSON.stringify({ id: request.id, result })}\n`));
      },
      end: vi.fn(),
    };

    process.argv = ['node', 'quota-query.mjs', 'codex'];
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    mocks.spawn.mockReturnValue({ stdout, stdin, kill: vi.fn() });

    await import('../quota-query.mjs');

    expect(mocks.spawn.mock.calls[0][2].env).toMatchObject({ CODEX_HOME: 'isolated-profile', OPENAI_API_KEY: '' });
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('"used":10'));
  });

  it('clears API-key overrides when reading Claude plan usage', async () => {
    process.argv = ['node', 'quota-query.mjs', 'claude'];
    vi.stubEnv('ANTHROPIC_API_KEY', 'override');
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    mocks.query.mockReturnValue({
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => ({
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 10, resets_at: '2026-11-16T00:00:00Z' },
          seven_day: { utilization: 20, resets_at: '2026-11-20T00:00:00Z' },
        },
      }),
      close: vi.fn(),
    });

    await import('../quota-query.mjs');

    expect(mocks.query.mock.calls[0][0].options.env.ANTHROPIC_API_KEY).toBe('');
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('"used":20'));
  });
});
