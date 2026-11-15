import { describe, expect, it } from 'vitest';
import { runClaude } from './claude.mjs';

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
