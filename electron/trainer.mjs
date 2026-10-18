/**
 * Runs policy training (electron/trainer/train.py) as a child process through uv, which
 * installs the pinned Python, MuJoCo and PyTorch on first use into library/trainer-env. One job
 * per scene tab; progress lines from the trainer are forwarded as `train-progress` events, and a
 * finished policy is stored in library/policies/<id>/.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TRAINER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'trainer');

/** uv on PATH or in its usual install places (GUI apps don't inherit the shell's PATH) */
function findUv() {
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

const newId = () => `policy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export class Trainer {
  constructor(libraryDir, emit) {
    this.libraryDir = libraryDir;
    this.emit = emit;
    this.jobsDir = path.join(libraryDir, 'training');
    this.policiesDir = path.join(libraryDir, 'policies');
    this.envDir = path.join(libraryDir, 'trainer-env');
    /** workspace id → { child, id, dir } */
    this.jobs = new Map();
  }

  status() {
    const uv = findUv();
    return { uv: !!uv, ready: fs.existsSync(path.join(this.envDir, 'pyvenv.cfg')), running: [...this.jobs.keys()] };
  }

  /** Starts training; resolves once it's running. Progress, completion and errors arrive as events. */
  start({ workspaceId = 'main', xml, job }) {
    if (this.jobs.has(workspaceId)) throw new Error('This scene is already training.');
    const uv = findUv();
    if (!uv) throw new Error('Training needs uv. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh');
    const id = newId();
    const dir = path.join(this.jobsDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'model.xml'), xml);
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2));
    const firstRun = !fs.existsSync(path.join(this.envDir, 'pyvenv.cfg'));
    const send = (payload) => this.emit({ type: 'train-progress', workspaceId, jobId: id, ...payload });
    send({ kind: 'status', message: firstRun ? 'Installing Python, MuJoCo and PyTorch (one time)' : 'Starting' });

    const child = spawn(uv, ['run', '--project', TRAINER_DIR, '--frozen', 'python', '-u', path.join(TRAINER_DIR, 'train.py'), '--job', dir], {
      cwd: dir,
      env: {
        ...process.env,
        UV_PROJECT_ENVIRONMENT: this.envDir,
        PYTHONUNBUFFERED: '1',
        // Keep torch from oversubscribing the cores MuJoCo's rollout threads use
        OMP_NUM_THREADS: '4',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.jobs.set(workspaceId, { child, id, dir });
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
        } catch {
          // not a trainer line
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      err = (err + chunk.toString()).slice(-8000);
    });
    child.on('close', (code) => {
      this.jobs.delete(workspaceId);
      if (done) {
        try {
          const record = this.storePolicy(id, dir, job, done);
          send({ kind: 'done', record, eval: done.eval, stopped: done.stopped });
        } catch (e) {
          send({ kind: 'error', message: `Couldn't save the policy: ${e.message}` });
        }
        return;
      }
      if (code === null || code === 143) {
        send({ kind: 'error', message: 'Training stopped.' });
        return;
      }
      // The last meaningful Python line (the exception), not the whole traceback
      const lines = err.trim().split('\n').filter((l) => l.trim() && !l.startsWith(' '));
      send({ kind: 'error', message: lines.at(-1) || `The trainer exited with code ${code}.` });
    });
    return { jobId: id };
  }

  stop(workspaceId = 'main') {
    const job = this.jobs.get(workspaceId);
    // SIGTERM: the trainer saves what it has learned and evaluates it before exiting
    job?.child.kill('SIGTERM');
    return { stopping: !!job };
  }

  storePolicy(id, dir, job, done) {
    const into = path.join(this.policiesDir, id);
    fs.mkdirSync(into, { recursive: true });
    fs.copyFileSync(path.join(dir, 'policy.json'), path.join(into, 'policy.json'));
    if (fs.existsSync(path.join(dir, 'policy.onnx'))) fs.copyFileSync(path.join(dir, 'policy.onnx'), path.join(into, 'policy.onnx'));
    fs.copyFileSync(path.join(dir, 'model.xml'), path.join(into, 'model.xml'));
    return {
      id,
      name: job.name,
      task: job.task,
      robot: job.robotKey,
      robotName: job.robotName,
      command: job.command,
      trainedSteps: done.steps,
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
    for (const { child } of this.jobs.values()) child.kill('SIGTERM');
  }
}
