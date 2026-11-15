import { describe, expect, it } from 'vitest';
import { proposalFiles, proposalFingerprint } from './harnessPatch.mjs';

const prompt = 'electron/cad-agent-prompt.mjs';

describe('measured harness proposal boundaries', () => {
  it('requires a production harness change and rejects task, grader and unrelated product edits', () => {
    expect(proposalFiles([prompt, 'docs/guide/agent.md', 'electron/cad-agent-prompt.test.mjs'])).toEqual([prompt]);
    expect(() => proposalFiles(['docs/guide/agent.md'])).toThrow('production harness');
    expect(() => proposalFiles([prompt, 'bench/micro/tasks/assembly.mjs'])).toThrow('outside');
    expect(() => proposalFiles([prompt, 'src/components/Button.tsx'])).toThrow('outside');
  });

  it('keeps the production patch identity stable when only tests or docs change and includes new module content', () => {
    const base = { patchId: 'stable-patch-id', added: [{ file: 'electron/cad-mcp/new.mjs', content: 'first' }] };

    expect(proposalFingerprint(base)).toBe(proposalFingerprint(structuredClone(base)));
    expect(proposalFingerprint({ ...base, added: [{ ...base.added[0], content: 'second' }] })).not.toBe(
      proposalFingerprint(base),
    );
    expect(() => proposalFingerprint({ patchId: '', added: [] })).toThrow('empty');
  });
});
