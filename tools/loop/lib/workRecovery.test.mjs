import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-recovery-'));

vi.stubEnv('BASECASE_LOOP_DIR', directory);

const { saveRecovery, recoveryFor, recoveryReady, clearRecovery, hasRecovery } = await import('./workRecovery.mjs');

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('builder recovery', () => {
  it('retains a failed session and permits one recovery for the same inputs', () => {
    const worktree = { dir: directory, branch: 'loop/build/42-feature' };
    const session = { provider: 'codex', id: 'saved-thread' };
    const first = saveRecovery(42, { worktree, session, inputSignature: 'source-a' });

    expect(recoveryReady(first, 'source-a')).toBe(true);
    expect(recoveryFor(42).session.id).toBe('saved-thread');
    expect(hasRecovery(directory)).toBe(true);

    const second = saveRecovery(42, { worktree, session, inputSignature: 'source-a' });

    expect(recoveryReady(second, 'source-a')).toBe(false);
    expect(recoveryReady(second, 'source-b')).toBe(true);
    clearRecovery(42);
    expect(hasRecovery(directory)).toBe(false);
  });
});
