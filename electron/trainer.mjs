import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
    [
      'run',
      '--project',
      TRAINER_DIR,
      '--frozen',
      '--exact',
      'python',
      '-u',
      path.join(TRAINER_DIR, 'train.py'),
      '--job',
      dir,
    ],
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

const RUN_ID = /^policy-[a-z0-9-]+$/;
const RUNS_KEPT = 8;
const WARM_DIR = 'warm';
const WARM_FILES = ['resume.json', 'policy.json'];

function copyWarmStart(from, dir) {
  const files = WARM_FILES.filter((name) => fs.existsSync(path.join(from, name)));

  if (!files.length) throw new Error('The run to continue from has no policy.');

  fs.mkdirSync(path.join(dir, WARM_DIR));
  files.forEach((name) => fs.copyFileSync(path.join(from, name), path.join(dir, WARM_DIR, name)));

  return WARM_DIR;
}

export const PRIORITY = { user: 0, kit: 1 };

export const GATE_LEASE = path.join(os.tmpdir(), 'basecase-gatekeeper.lease');

const LEASE_POLL_MS = 30000;
const KIT_NICE = 10;

function lowerPriority(child) {
  try {
    if (child.pid) os.setPriority(child.pid, KIT_NICE);
  } catch {}
}

export class Trainer {
  constructor(libraryDir, emit, spawnFn = spawnTrainer, forge = forgeBinary()) {
    this.leaseFile = null;
    this.leasePollMs = LEASE_POLL_MS;
    this.leaseTimer = null;
    this.libraryDir = libraryDir;
    this.emit = emit;
    this.spawnTrainer = spawnFn;
    this.forge = forge;
    this.jobsDir = path.join(libraryDir, 'training');
    this.policiesDir = path.join(libraryDir, 'policies');
    this.envDir = path.join(libraryDir, 'trainer-env');
    this.jobs = new Map();
    this.queue = [];
    this.waiters = new Map();
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

    const warmFrom = this.warmSource(job.warmStart);
    const id = newId();
    const dir = path.join(this.jobsDir, id);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'model.xml'), xml);

    const runJob = { ...job, warmStart: warmFrom ? copyWarmStart(warmFrom, dir) : undefined };

    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(runJob, null, 2));

    const entry = { workspaceId, job: runJob, id, dir, priority, uv };
    const send = this.sender(entry);

    if (priority === PRIORITY.user) this.yieldKit();

    if (this.jobs.size || this.blocked(entry)) {
      this.enqueue(entry);
      send({ kind: 'status', message: this.waitingMessage() });
    } else {
      this.launch(entry);
    }

    this.watchLease();

    return { jobId: id };
  }

  warmSource(run) {
    if (run === undefined || run === null) return null;

    if (typeof run !== 'string' || !RUN_ID.test(run)) throw new Error('A warm start names an earlier training run.');

    const from = path.join(this.jobsDir, run);

    if (!fs.existsSync(from)) throw new Error('The run to continue from is gone.');

    return from;
  }

  pruneRuns() {
    const active = new Set([...this.jobs.values(), ...this.queue].map((e) => e.id));
    const runs = fs.existsSync(this.jobsDir)
      ? fs.readdirSync(this.jobsDir).filter((name) => RUN_ID.test(name) && !active.has(name))
      : [];
    const newestFirst = runs.sort().reverse();

    newestFirst
      .slice(RUNS_KEPT)
      .forEach((name) => fs.rmSync(path.join(this.jobsDir, name), { recursive: true, force: true }));
  }

  useGateLease(file = GATE_LEASE, pollMs = LEASE_POLL_MS) {
    this.leaseFile = file;
    this.leasePollMs = pollMs;

    return this;
  }

  waitingMessage() {
    const running = [...this.jobs.values()][0];

    return running ? `Queued. Starts after ${running.job.name}.` : 'Waiting for the Gatekeeper run to finish.';
  }

  leaseHeld() {
    return !!this.leaseFile && fs.existsSync(this.leaseFile);
  }

  blocked(entry) {
    return entry.priority === PRIORITY.kit && this.leaseHeld();
  }

  yieldKit() {
    for (const running of this.jobs.values()) {
      if (running.entry.priority !== PRIORITY.kit || running.stopping) continue;

      running.yielded = true;
      running.stopping = true;
      askToStop(running);
    }
  }

  watchLease() {
    const kitWaiting = [...this.jobs.values(), ...this.queue].some((e) => (e.entry ?? e).priority === PRIORITY.kit);

    if (!kitWaiting || !this.leaseFile) {
      clearInterval(this.leaseTimer);
      this.leaseTimer = null;

      return;
    }

    this.leaseTimer ??= setInterval(() => this.checkLease(), this.leasePollMs);
  }

  checkLease() {
    if (this.leaseHeld()) this.yieldKit();
    else this.launchNext();

    this.watchLease();
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

    const at = this.queue.findIndex((q) => !this.blocked(q));

    if (at >= 0) this.launch(this.queue.splice(at, 1)[0]);

    this.watchLease();
  }

  launch(entry) {
    const { workspaceId, job, id, dir, uv } = entry;

    fs.rmSync(path.join(dir, 'stop'), { force: true });

    const firstRun = !this.forge && !fs.existsSync(path.join(this.envDir, 'pyvenv.cfg'));
    const send = this.sender(entry);

    send({ kind: 'status', message: firstRun ? 'Installing Python, MuJoCo and PyTorch (one time)' : 'Starting' });

    const child = this.spawnTrainer({ uv, dir, envDir: this.envDir, forge: this.forge });
    const running = { child, id, dir, job, entry, stopping: false, yielded: false };

    if (entry.priority === PRIORITY.kit) lowerPriority(child);

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
    child.on('close', (code, signal) => this.closed(running, { code, signal, done, err }));
  }

  closed(running, { code, signal, done, err }) {
    const { entry } = running;
    const send = this.sender(entry);

    this.jobs.delete(entry.workspaceId);

    if (running.yielded) {
      this.enqueue(entry);
      send({ kind: 'status', message: 'Paused for other training. Starts again after it.' });
      queueMicrotask(() => this.launchNext());

      return;
    }

    this.wake(entry.workspaceId);
    queueMicrotask(() => this.launchNext());
    send(this.outcome(running, { code, signal, done, err }));
    this.pruneRuns();
  }

  outcome(running, { code, signal, done, err }) {
    const { id, dir, job } = running;

    if (done) {
      try {
        return { kind: 'done', record: this.storePolicy(id, dir, job, done), eval: done.eval, stopped: done.stopped };
      } catch (e) {
        return { kind: 'error', message: `Couldn't save the policy: ${e.message}` };
      }
    }

    if (running.stopping) return { kind: 'error', message: 'Training stopped.' };

    if (code === null) return { kind: 'error', message: `The trainer crashed (${signal ?? 'killed'}).` };

    const lines = err
      .trim()
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith(' '));

    return { kind: 'error', message: lines.at(-1) || `The trainer exited with code ${code}.` };
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
      job.yielded = false;
      askToStop(job);
    }

    return { stopping: !!job };
  }

  wake(workspaceId) {
    const waiting = this.waiters.get(workspaceId) ?? [];

    this.waiters.delete(workspaceId);
    waiting.forEach((resolve) => resolve());
  }

  release(workspaceId) {
    const waiting = this.queue.findIndex((q) => q.workspaceId === workspaceId);

    if (waiting >= 0) this.queue.splice(waiting, 1);

    const job = this.jobs.get(workspaceId);

    if (!job) return Promise.resolve();

    const closed = new Promise((resolve) =>
      this.waiters.set(workspaceId, [...(this.waiters.get(workspaceId) ?? []), resolve]),
    );

    job.stopping = true;
    job.yielded = false;
    askToStop(job);

    return closed;
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
      minutes: job.minutes,
      modelVersion: job.modelVersion ?? 0,
      ...(job.fingerprint ? { fingerprint: job.fingerprint } : {}),
      createdAt: new Date().toISOString(),
      eval: done.eval,
    };
  }

  getPolicy(id) {
    if (!RUN_ID.test(id)) return null;

    const file = path.join(this.policiesDir, id, 'policy.json');

    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  deletePolicy(id) {
    if (!RUN_ID.test(id)) return false;

    fs.rmSync(path.join(this.policiesDir, id), { recursive: true, force: true });

    return true;
  }

  dispose() {
    this.queue = [];
    clearInterval(this.leaseTimer);

    for (const job of this.jobs.values()) {
      job.stopping = true;
      askToStop(job);
      job.child.kill();
    }
  }
}
