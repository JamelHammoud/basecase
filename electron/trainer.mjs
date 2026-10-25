import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUv } from './uv.mjs';

const TRAINER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'trainer');

const newId = () => `policy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export class Trainer {
  constructor(libraryDir, emit) {
    this.libraryDir = libraryDir;
    this.emit = emit;
    this.jobsDir = path.join(libraryDir, 'training');
    this.policiesDir = path.join(libraryDir, 'policies');
    this.envDir = path.join(libraryDir, 'trainer-env');
    this.jobs = new Map();
  }

  status() {
    const uv = findUv();

    return { uv: !!uv, ready: fs.existsSync(path.join(this.envDir, 'pyvenv.cfg')), running: [...this.jobs.keys()] };
  }

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

    const child = spawn(
      uv,
      ['run', '--project', TRAINER_DIR, '--frozen', 'python', '-u', path.join(TRAINER_DIR, 'train.py'), '--job', dir],
      {
        cwd: dir,
        env: {
          ...process.env,
          UV_PROJECT_ENVIRONMENT: this.envDir,
          PYTHONUNBUFFERED: '1',
          OMP_NUM_THREADS: '4',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

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
        } catch {}
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

      const lines = err
        .trim()
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith(' '));

      send({ kind: 'error', message: lines.at(-1) || `The trainer exited with code ${code}.` });
    });

    return { jobId: id };
  }

  stop(workspaceId = 'main') {
    const job = this.jobs.get(workspaceId);

    job?.child.kill('SIGTERM');

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
