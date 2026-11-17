import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { findOnPath } from '../executables.mjs';

export async function boardExecutable() {
  const configured = process.env.BASECASE_KICAD_CLI;

  if (configured && !/\.(cmd|bat)$/iu.test(configured)) {
    try {
      await access(configured);

      return configured;
    } catch {
      throw new Error('board-validator');
    }
  }

  const found = findOnPath('kicad-cli');

  if (found) return found;

  const candidates = ['/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'];

  if (process.platform === 'win32')
    candidates.push(path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'KiCad', '9.0', 'bin', 'kicad-cli.exe'));

  for (const file of candidates) {
    try {
      await access(file);

      return file;
    } catch {
      continue;
    }
  }

  throw new Error('board-validator');
}

export function boardProcess({ command, args, cwd, signal }) {
  signal?.throwIfAborted();

  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(
      [
        'PATH',
        'HOME',
        'USERPROFILE',
        'APPDATA',
        'LOCALAPPDATA',
        'SystemRoot',
        'WINDIR',
        'TMPDIR',
        'TEMP',
        'TMP',
        'LANG',
        'LC_ALL',
        'LD_LIBRARY_PATH',
      ]
        .filter((key) => process.env[key])
        .map((key) => [key, process.env[key]]),
    );
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let bytes = 0;
    let error = null;
    const stop = () => {
      error ??= new Error('board-validation');
      child.kill();
    };
    const timer = setTimeout(stop, 30_000);
    const append = (chunk) => {
      bytes += chunk.length;

      if (bytes > 1024 * 1024) return stop();

      chunks.push(chunk);
    };

    signal?.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (cause) => {
      error = cause;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);

      if (error || code !== 0)
        return reject(
          error ?? new Error('board-validation', { cause: { code, output: Buffer.concat(chunks).toString('utf8') } }),
        );

      resolve(Buffer.concat(chunks).toString('utf8').trim());
    });
  });
}
