import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { taskInputSignature } from './taskInputs.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-task-inputs-'));
const git = (args) => {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });

  return { ok: result.status === 0, out: result.stdout.trim() };
};

git(['init', '-q']);
fs.mkdirSync(path.join(directory, 'src', 'cameras'), { recursive: true });
fs.writeFileSync(path.join(directory, 'src', 'cameras', 'input.ts'), 'export const input = 1;\n');
fs.writeFileSync(path.join(directory, 'AGENTS.md'), 'Fixture rules.\n');
git(['add', '.']);
git(['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture']);
git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);

afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('task evidence invalidation', () => {
  it('reconsiders changed declared source objects without reacting to unrelated commits', () => {
    const step = { title: 'Improve camera input', body: 'Inputs: `src/cameras/`\nVerify in Windows CI.' };
    const a = taskInputSignature(step, () => ({ ok: true, out: '100644 blob a\tsrc/cameras/input.ts' }));
    const unchanged = taskInputSignature(step, () => ({ ok: true, out: '100644 blob a\tsrc/cameras/input.ts' }));
    const changed = taskInputSignature(step, () => ({ ok: true, out: '100644 blob b\tsrc/cameras/input.ts' }));

    expect(unchanged).toBe(a);
    expect(changed).not.toBe(a);
  });

  it('does not freeze tasks when their source inputs cannot be established', () => {
    expect(taskInputSignature({ title: 'Feature', body: 'Build it.' }, () => ({ ok: true, out: '' }))).toBeNull();
    expect(taskInputSignature({ body: 'Edit `src/cameras/`.' }, () => ({ ok: false }))).toBeNull();
  });

  it('requires every named source to exist even when toolchain files were found', () => {
    const execute = (...args) => git(args[1]);

    expect(taskInputSignature({ body: 'Inputs: `src/cameras/`' }, execute)).toEqual(expect.any(String));
    expect(taskInputSignature({ body: 'Inputs: `src/missing/`' }, execute)).toBeNull();
    expect(taskInputSignature({ body: 'Inputs: `src/cameras/`, `src/missing/`' }, execute)).toBeNull();
  });
});
