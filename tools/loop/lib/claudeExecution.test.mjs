import { describe, expect, it } from 'vitest';
import { claudeSubscriptionEnv, runClaude } from './claude.mjs';

const options = {
  cwd: '.',
  brief: 'Check the change.',
  prompt: 'Review it.',
  schema: {},
  hours: 1,
  policy: { claudeModel: 'sonnet', claudeEffort: 'high' },
};
const answer = JSON.stringify({ type: 'result', structured_output: { changed: true } });

describe('Claude execution', () => {
  it('uses the subscription environment even when API auth or a paid provider was selected', () => {
    const overridden = {
      ANTHROPIC_API_KEY: 'api-key',
      ANTHROPIC_AUTH_TOKEN: 'api-token',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_USE_VERTEX: '1',
      CLAUDE_CODE_USE_FOUNDRY: '1',
      CLAUDE_CODE_USE_ANTHROPIC_AWS: '1',
      CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD: '1',
      CLAUDE_CODE_USE_MANTLE: '1',
    };

    expect(Object.values(claudeSubscriptionEnv(overridden))).toEqual(Array(8).fill(''));

    runClaude(options, (_command, args, settings) => {
      expect(settings.env).toEqual(claudeSubscriptionEnv());
      expect(JSON.parse(args[args.indexOf('--settings') + 1])).toEqual({ apiKeyHelper: '' });

      return { ok: true, out: answer, err: '' };
    });
  });

  it('rejects unsuccessful processes even if stdout contains a successful answer', () => {
    const result = runClaude(options, () => ({ ok: false, out: answer, err: 'process timed out' }));

    expect(result).toEqual({ ok: false, error: 'process timed out' });
  });

  it('accepts a structured answer only from a successful process', () => {
    expect(runClaude(options, () => ({ ok: true, out: answer, err: '' }))).toMatchObject({
      ok: true,
      output: { changed: true },
    });
  });

  it('keeps prose-only overflow free of personal and repository customizations', () => {
    let args;

    runClaude({ ...options, name: 'voice', sandbox: { tools: [], allow: [] } }, (_command, flags) => {
      args = flags;

      return { ok: true, out: answer, err: '' };
    });

    expect(args).toContain('--safe-mode');
    expect(args).toContain('--restricted');
    expect(args).toContain('--strict-mcp-config');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
  });
});
