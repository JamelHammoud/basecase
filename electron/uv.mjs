import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exeName, findOnPath, IS_WINDOWS } from './executables.mjs';

function installedUv() {
  const uv = exeName('uv');
  const home = os.homedir();
  const windows = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', uv)];
  const unix = ['/opt/homebrew/bin/uv', '/usr/local/bin/uv'];

  return [
    process.env.BASECASE_UV,
    path.join(home, '.local', 'bin', uv),
    path.join(home, '.cargo', 'bin', uv),
    ...(IS_WINDOWS ? windows : unix),
  ].filter(Boolean);
}

function uvOnPath() {
  if (IS_WINDOWS) return findOnPath('uv');

  try {
    return execFileSync('/bin/sh', ['-lc', 'command -v uv'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

export function findUv() {
  return installedUv().find((c) => fs.existsSync(c)) ?? uvOnPath();
}

export const UV_INSTALL = IS_WINDOWS
  ? 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
  : 'curl -LsSf https://astral.sh/uv/install.sh | sh';

export const UV_MISSING = `Install uv first: ${UV_INSTALL}`;
