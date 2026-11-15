import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUv, UV_MISSING } from '../uv.mjs';

const PROJECT = path.dirname(fileURLToPath(import.meta.url));
const MAX_LINE = 64 * 1024;

export function spawnVisionTrainer({ dir, envDir, onEvent, uv = findUv(), spawnProcess = spawn }) {
  if (!uv) throw new Error(UV_MISSING);

  fs.mkdirSync(path.join(dir, '.ultralytics'), { recursive: true });

  const child = spawnProcess(
    uv,
    ['run', '--project', PROJECT, '--frozen', '--exact', 'python', '-u', path.join(PROJECT, 'train.py'), '--job', dir],
    {
      cwd: dir,
      env: {
        ...process.env,
        UV_PROJECT_ENVIRONMENT: envDir,
        PYTHONUNBUFFERED: '1',
        PYTORCH_ENABLE_MPS_FALLBACK: '1',
        YOLO_CONFIG_DIR: path.join(dir, '.ultralytics'),
        YOLO_OFFLINE: 'true',
        YOLO_AUTOINSTALL: 'false',
        OMP_NUM_THREADS: '2',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const done = watchProcess(child, onEvent);

  return {
    done,
    stop: async () => {
      fs.writeFileSync(path.join(dir, 'stop'), '');
      await done;
    },
  };
}

function checkedEvent(line) {
  try {
    const value = JSON.parse(line);

    return value && typeof value === 'object' && ['progress', 'done', 'error', 'status'].includes(value.type)
      ? value
      : null;
  } catch {
    return null;
  }
}

function watchProcess(child, onEvent) {
  let pending = '';
  let dropping = false;
  let stderr = '';
  let reportedError = false;

  child.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');

    for (const [index, line] of lines.entries()) {
      pending += line;

      if (pending.length > MAX_LINE) {
        pending = '';
        dropping = true;
      }

      if (index === lines.length - 1) continue;

      const event = dropping ? null : checkedEvent(pending);

      if (event) {
        reportedError ||= event.type === 'error';
        onEvent(event);
      }

      pending = '';
      dropping = false;
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-8000);
  });

  return new Promise((resolve) => {
    child.once('error', (error) => {
      onEvent({ type: 'error', message: error.message });
      resolve({ code: null });
    });
    child.once('close', (code) => {
      if (code !== 0 && stderr && !reportedError) onEvent({ type: 'error', message: stderr.slice(-1000).trim() });

      resolve({ code });
    });
  });
}
