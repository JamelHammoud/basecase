import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEP_EXPORT_MS, STEP_MESSAGES } from '../stepPolicy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const kernelDir = path.resolve(here, '..');
const root = path.resolve(kernelDir, '..', '..');
const cadImportDir = path.resolve(kernelDir, '..', 'cadImport');
const POOL_SIZE = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
const NETWORK_PERMISSION_NODE = 25;
const STOPPED_ERROR = 'The CAD kernel stopped (time or memory limit). Simplify the part and try again.';

function realDir(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

function permissionArgs() {
  if (Number(process.versions.node.split('.')[0]) < NETWORK_PERMISSION_NODE) return [];

  return [
    '--permission',
    ...[path.join(root, 'node_modules'), path.join(root, 'vendor'), kernelDir, cadImportDir].flatMap((dir) =>
      Array.from(new Set([dir, realDir(dir)])).map((d) => `--allow-fs-read=${path.join(d, '*')}`),
    ),
  ];
}

const plainSolid = (solid) => {
  if (solid.type === 'mesh') return { ...solid, positions: Array.from(solid.positions) };

  if (solid.type === 'moved') return { ...solid, solid: plainSolid(solid.solid) };

  return solid.type === 'boolean' ? { ...solid, solids: solid.solids.map(plainSolid) } : solid;
};

const plainStepJob = (job) => ({
  ...job,
  bodies: job.bodies.map((b) => ({ ...b, solid: plainSolid(b.solid), fallback: b.fallback && plainSolid(b.fallback) })),
});

const timeoutError = (timeoutMs) =>
  `Rendering took longer than ${Math.round(timeoutMs / 1000)} s. Simplify the part (fewer booleans, lower $fn, fewer hull() pieces).`;

export function createNodeKernel({ permissionModel = true } = {}) {
  let nextId = 1;
  const kernels = [];
  const waiting = [];

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

  function spawnKernel() {
    const proc = fork(path.join(here, 'process.mjs'), [], {
      execArgv: permissionModel ? permissionArgs() : [],
      env: {},
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const k = { proc, busy: false, job: null };

    k.ready = new Promise((resolve, reject) => {
      proc.once('message', (m) => (m?.ready ? resolve() : reject(new Error('Kernel did not start'))));
      proc.once('exit', (code) => reject(new Error(`Kernel exited (${code})`)));
    });
    k.ready.catch(() => {});
    proc.on('message', (m) => {
      if (m?.id === undefined || !k.job || k.job.id !== m.id) return;

      finish(k, m);
    });
    proc.on('exit', () => {
      const i = kernels.indexOf(k);

      if (i >= 0) kernels.splice(i, 1);

      if (k.job) finish(k, { id: k.job.id, ok: false, error: k.job.messages?.stopped ?? STOPPED_ERROR }, true);
    });
    proc.stderr.on('data', () => {});
    kernels.push(k);

    return k;
  }

  async function getKernel() {
    let k = kernels.find((x) => !x.busy);

    if (!k && kernels.length < POOL_SIZE) k = spawnKernel();

    if (!k) return null;

    k.busy = true;
    await k.ready;

    return k;
  }

  function assign(k, job) {
    k.job = job;
    job.timer = setTimeout(() => {
      finish(k, { id: job.id, ok: false, error: job.messages?.timeout ?? timeoutError(job.timeoutMs) }, true);
      k.proc.kill();
    }, job.timeoutMs);
    k.proc.send({
      id: job.id,
      language: job.language,
      code: job.code,
      expect: job.expect,
      mesh: job.mesh,
      step: job.step,
    });
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

      assign(k, job);
    }
  }

  const submit = (job) =>
    new Promise((resolve) => {
      waiting.push({ ...job, id: nextId++, resolve });
      pump().catch((err) => waiting.shift()?.resolve({ ok: false, error: String(err?.message ?? err) }));
    });

  return {
    renderPart(language, code, options = {}) {
      const { timeoutMs = 90000, expect } = options;

      return submit({ language, code, expect, timeoutMs });
    },
    auditPart: (mesh, timeoutMs = 60000) => submit({ mesh, timeoutMs }),
    exportStep: (job, timeoutMs = STEP_EXPORT_MS) =>
      submit({ step: plainStepJob(job), language: 'replicad', timeoutMs, messages: STEP_MESSAGES }),
    warmUp() {
      if (kernels.length === 0) spawnKernel();
    },
    stopKernels() {
      for (const k of [...kernels]) k.proc.kill();
    },
  };
}

export const { renderPart, auditPart, exportStep, warmUp, stopKernels } = createNodeKernel();

export const nodeKernelService = {
  render: ({ language, code, expect, timeoutMs }) => renderPart(language, code, { expect, timeoutMs }),
  audit: (body) => auditPart(JSON.parse(body).mesh),
  exportStep: (job) => exportStep(job),
  warm: warmUp,
  stop: stopKernels,
};
