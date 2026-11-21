import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONVERTER_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return {};
  }
}

function runChild({ command, args, envDir, out, say, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: out,
      env: { ...process.env, UV_PROJECT_ENVIRONMENT: envDir, OPENBLAS_NUM_THREADS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    let buffer = '';
    let failure = null;
    let err = '';

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();

      const lines = buffer.split('\n');

      buffer = lines.pop() ?? '';

      for (const line of lines.filter((line) => line.startsWith('{'))) {
        const message = parseLine(line);

        if (message.type === 'status') say(message.message);

        if (message.type === 'error') failure = message.message;
      }
    });
    child.stderr.on('data', (chunk) => {
      err = (err + chunk.toString()).slice(-4000);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);

      if (code === 0) resolve();
      else reject(new Error(failure ?? (err.trim().split('\n').pop() || 'The converter stopped.')));
    });
  });
}

export async function runConverter({ uv, envDir, root, out, say, localPackage = false }) {
  const started = Date.now();

  await runChild({
    command: uv,
    args: ['sync', '--project', CONVERTER_DIR, '--frozen'],
    envDir,
    out,
    say,
    timeoutMs: CONVERT_TIMEOUT_MS,
  });

  const python =
    process.platform === 'win32' ? path.join(envDir, 'Scripts', 'python.exe') : path.join(envDir, 'bin', 'python');
  const args = [
    path.join(CONVERTER_DIR, 'convert.py'),
    '--root',
    root,
    '--out',
    out,
    ...(localPackage ? ['--local-package'] : []),
  ];

  await runChild({
    command: python,
    args,
    envDir,
    out,
    say,
    timeoutMs: Math.max(1, CONVERT_TIMEOUT_MS - (Date.now() - started)),
  });
}
