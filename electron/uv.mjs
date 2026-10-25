import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function findUv() {
  const candidates = [
    process.env.BASECASE_UV,
    path.join(os.homedir(), '.local', 'bin', 'uv'),
    path.join(os.homedir(), '.cargo', 'bin', 'uv'),
    '/opt/homebrew/bin/uv',
    '/usr/local/bin/uv',
  ].filter(Boolean);

  for (const c of candidates) if (fs.existsSync(c)) return c;

  try {
    return execFileSync('/bin/sh', ['-lc', 'command -v uv'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

export const UV_MISSING = 'Install uv first: curl -LsSf https://astral.sh/uv/install.sh | sh';
