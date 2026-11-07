import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_WINDOWS } from './executables.mjs';
import { findUv, UV_INSTALL } from './uv.mjs';

const TRAINER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'trainer');
const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORGE_NAME = IS_WINDOWS ? 'forge-train.exe' : 'forge-train';

export function forgeBinary(env = process.env, resources = process.resourcesPath) {
  if (env.BASECASE_TRAINER === 'python') return null;

  const candidates = [
    resources && path.join(resources, 'forge', FORGE_NAME),
    path.join(REPO_DIR, 'forge', 'target', 'release', FORGE_NAME),
  ].filter(Boolean);

  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function askToStop({ child, dir }) {
  try {
    fs.writeFileSync(path.join(dir, 'stop'), '');
  } catch {
    child.kill();

    return;
  }

  if (!IS_WINDOWS) child.kill('SIGTERM');
}

function spawnTrainer({ uv, dir, envDir, forge }) {
  if (forge) return spawn(forge, ['--job', dir], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  return spawn(
    uv,
    ['run', '--project', TRAINER_DIR, '--frozen', 'python', '-u', path.join(TRAINER_DIR, 'train.py'), '--job', dir],
    {
      cwd: dir,
      env: {
        ...process.env,
        UV_PROJECT_ENVIRONMENT: envDir,
        PYTHONUNBUFFERED: '1',
        OMP_NUM_THREADS: '4',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
}

const newId = () => `policy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const PRIORITY = { user: 0, kit: 1 };

export class Trainer {
  constructor(libraryDir, emit, spawnFn = spawnTrainer, forge = forgeBinary()) {
    this.libraryDir = libraryDir;
    this.emit = emit;
    this.spawnTrainer = spawnFn;
    this.forge = forge;
    this.jobsDir = path.join(libraryDir, 'training');
    this.policiesDir = path.join(libraryDir, 'policies');
    this.envDir = path.join(libraryDir, 'trainer-env');
    this.jobs = new Map();
    this.queue = [];
  }

  status() {
    const uv = findUv();

    return {
      uv: !!uv || !!this.forge,
      uvInstall: UV_INSTALL,
      ready: !!this.forge || fs.existsSync(path.join(this.envDir, 'pyvenv.cfg')),
      engine: this.forge ? 'forge' : 'python',
      running: [...this.jobs.keys()],
      queued: this.queue.map((q) => q.workspaceId),
    };
  }

  start({ workspaceId = 'main', xml, job, priority = PRIORITY.user }) {
    if (this.jobs.has(workspaceId) || this.queue.some((q) => q.workspaceId === workspaceId))
      throw new Error('This scene is already training.');

    const uv = this.forge ? null : findUv();

    if (!this.forge && !uv) throw new Error(`Training needs uv. Install it with: ${UV_INSTALL}`);

    const id = newId();
    const dir = path.join(this.jobsDir, id);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'model.xml'), xml);
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2));

    const entry = { workspaceId, job, id, dir, priority, uv };
    const send = this.sender(entry);

    if (this.jobs.size) {
      this.enqueue(entry);
      send({ kind: 'status', message: `Queued. Starts after ${[...this.jobs.values()][0].job.name}.` });
    } else {
      this.launch(entry);
    }

    return { jobId: id };
  }

  sender({ workspaceId, id }) {
    return (payload) => this.emit({ type: 'train-progress', workspaceId, jobId: id, ...payload });
  }

  enqueue(entry) {
    this.queue.push(entry);
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  launchNext() {
    if (this.jobs.size) return;

    const next = this.queue.shift();

    if (next) this.launch(next);
  }

  launch(entry) {
    const { workspaceId, job, id, dir, uv } = entry;
    const firstRun = !this.forge && !fs.existsSync(path.join(this.envDir, 'pyvenv.cfg'));
    const send = this.sender(entry);

    send({ kind: 'status', message: firstRun ? 'Installing Python, MuJoCo and PyTorch (one time)' : 'Starting' });

    const child = this.spawnTrainer({ uv, dir, envDir: this.envDir, forge: this.forge });
    const running = { child, id, dir, job, stopping: false };

    this.jobs.set(workspaceId, running);

    let out = '';
    let err = '';
    let done = null;

    child.stdout.on('data', (chunk) => {
      out += chunk.toString();

      let nl;

      while ((nl = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, nl).trim();

        out = out.slice(nl + 1);

        if (!line.startsWith('{')) continue;

        try {
          const msg = JSON.parse(line);

          if (msg.type === 'progress') send({ kind: 'progress', progress: msg });
          else if (msg.type === 'status') send({ kind: 'status', message: msg.message });
          else if (msg.type === 'done') done = msg;
        } catch {}
      }
    });
    child.stderr.on('data', (chunk) => {
      err = (err + chunk.toString()).slice(-8000);
    });
    child.on('close', (code, signal) => {
      this.jobs.delete(workspaceId);
      queueMicrotask(() => this.launchNext());

      if (done) {
        try {
          const record = this.storePolicy(id, dir, job, done);

          send({ kind: 'done', record, eval: done.eval, stopped: done.stopped });
        } catch (e) {
          send({ kind: 'error', message: `Couldn't save the policy: ${e.message}` });
        }

        return;
      }

      if (running.stopping) {
        send({ kind: 'error', message: 'Training stopped.' });

        return;
      }

      if (code === null) {
        send({ kind: 'error', message: `The trainer crashed (${signal ?? 'killed'}).` });

        return;
      }

      const lines = err
        .trim()
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith(' '));

      send({ kind: 'error', message: lines.at(-1) || `The trainer exited with code ${code}.` });
    });
  }

  stop(workspaceId = 'main') {
    const waiting = this.queue.findIndex((q) => q.workspaceId === workspaceId);

    if (waiting >= 0) {
      const [entry] = this.queue.splice(waiting, 1);

      this.sender(entry)({ kind: 'error', message: 'Training stopped.' });

      return { stopping: true };
    }

    const job = this.jobs.get(workspaceId);

    if (job) {
      job.stopping = true;
      askToStop(job);
    }

    return { stopping: !!job };
  }

  storePolicy(id, dir, job, done) {
    const into = path.join(this.policiesDir, id);

    fs.mkdirSync(into, { recursive: true });
    fs.copyFileSync(path.join(dir, 'policy.json'), path.join(into, 'policy.json'));

    if (fs.existsSync(path.join(dir, 'policy.onnx')))
      fs.copyFileSync(path.join(dir, 'policy.onnx'), path.join(into, 'policy.onnx'));

    fs.copyFileSync(path.join(dir, 'model.xml'), path.join(into, 'model.xml'));

    return {
      id,
      name: job.name,
      task: job.task,
      robot: job.robotKey,
      robotName: job.robotName,
      command: job.command,
      trainedSteps: done.steps,
      modelVersion: job.modelVersion ?? 0,
      createdAt: new Date().toISOString(),
      eval: done.eval,
    };
  }

  getPolicy(id) {
    if (!/^policy-[a-z0-9-]+$/.test(id)) return null;

    const file = path.join(this.policiesDir, id, 'policy.json');

    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  deletePolicy(id) {
    if (!/^policy-[a-z0-9-]+$/.test(id)) return false;

    fs.rmSync(path.join(this.policiesDir, id), { recursive: true, force: true });

    return true;
  }

  dispose() {
    this.queue = [];

    for (const job of this.jobs.values()) {
      job.stopping = true;
      askToStop(job);
      job.child.kill();
    }
  }
}
