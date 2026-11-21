import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { secretsScan } from './secrets.mjs';

const fixture = vi.hoisted(() => ({ root: '' }));

vi.mock('./run.mjs', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    get root() {
      return fixture.root;
    },
    has: () => false,
    run: (cmd, args) => actual.run(cmd, args, { cwd: fixture.root }),
  };
});

afterEach(() => {
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

describe('secrets scan', () => {
  it('reports a tracked Hugging Face literal and accepts a runtime-joined placeholder', () => {
    fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-secrets-'));

    const file = path.join(fixture.root, 'token.mjs');
    const parts = ['hf_', 'testTokenThatMustNeverLeak0123456789'];
    const token = parts.join('');

    fs.writeFileSync(file, `export const TOKEN = '${token}';\n`);

    for (const args of [
      ['init', '--quiet'],
      ['add', 'token.mjs'],
    ]) {
      const result = spawnSync('git', args, { cwd: fixture.root, encoding: 'utf8', windowsHide: true });

      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    }

    const scan = secretsScan();

    expect(scan.name).toBe('Secrets');
    expect(scan.findings.filter((item) => item.severity === 'critical')).toEqual([
      expect.objectContaining({ severity: 'critical', title: 'Hugging Face token in token.mjs' }),
    ]);
    expect(JSON.stringify(scan)).not.toContain(token);
    fs.writeFileSync(file, `export const TOKEN = ${JSON.stringify(parts)}.join('');\n`);
    expect(secretsScan().findings.filter((item) => ['critical', 'high'].includes(item.severity))).toEqual([]);
  });
});
