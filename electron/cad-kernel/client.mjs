import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const POOL_SIZE = Math.max(1, Math.min(3, os.cpus().length - 1));

let sandboxed = true;
let nextId = 1;
const kernels = [];
const waiting = [];

function realDir(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

function spawnKernel() {
  const execArgv = sandboxed
    ? [
        '--permission',
        ...[path.join(root, 'node_modules'), path.join(root, 'vendor'), here].flatMap((dir) =>
          Array.from(new Set([dir, realDir(dir)])).map((d) => `--allow-fs-read=${d}/*`),
        ),
      ]
    : [];
  const proc = fork(path.join(here, 'kernel.mjs'), [], { execArgv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const k = { proc, busy: false, job: null };

  k.ready = new Promise((resolve, reject) => {
    proc.once('message', (m) => (m?.ready ? resolve() : reject(new Error('Kernel did not start'))));
    proc.once('exit', (code) => reject(new Error(`Kernel exited (${code})`)));
  });
  proc.on('message', (m) => {
    if (m?.id === undefined || !k.job || k.job.id !== m.id) return;

    finish(k, m);
  });
  proc.on('exit', () => {
    const i = kernels.indexOf(k);

    if (i >= 0) kernels.splice(i, 1);

    if (k.job)
      finish(
        k,
        {
          id: k.job.id,
          ok: false,
          error: 'The CAD kernel stopped (time or memory limit). Simplify the part and try again.',
        },
        true,
      );
  });
  proc.stderr.on('data', () => {});
  kernels.push(k);

  return k;
}

function finish(k, result, dead = false) {
  const job = k.job;

  k.job = null;
  k.busy = false;

  if (job) {
    clearTimeout(job.timer);
    job.resolve(result);
  }

  if (!dead) pump();
}

async function getKernel() {
  let k = kernels.find((x) => !x.busy);

  if (!k && kernels.length < POOL_SIZE) k = spawnKernel();

  if (!k) return null;

  k.busy = true;

  try {
    await k.ready;
  } catch (err) {
    k.proc.kill();

    if (sandboxed) {
      sandboxed = false;

      return getKernel();
    }

    throw err;
  }

  return k;
}

async function pump() {
  while (waiting.length) {
    const k = await getKernel();

    if (!k) return;

    const job = waiting.shift();

    if (!job) {
      k.busy = false;

      return;
    }

    k.job = job;
    job.timer = setTimeout(() => {
      finish(
        k,
        {
          id: job.id,
          ok: false,
          error: `Rendering took longer than ${Math.round(job.timeoutMs / 1000)} s. Simplify the part (fewer booleans, lower $fn, fewer hull() pieces).`,
        },
        true,
      );
      k.proc.kill();
    }, job.timeoutMs);
    k.proc.send({ id: job.id, language: job.language, code: job.code });
  }
}

export function renderPart(language, code, timeoutMs = 90000) {
  if (language === 'replicad' && !sandboxed) {
    return Promise.resolve({
      ok: false,
      error: 'replicad needs Node 22+ (sandboxed kernel). Use OpenSCAD for this part.',
    });
  }

  return new Promise((resolve) => {
    waiting.push({ id: nextId++, language, code, timeoutMs, resolve });
    pump();
  });
}

export function warmUp() {
  if (kernels.length === 0) spawnKernel();
}
