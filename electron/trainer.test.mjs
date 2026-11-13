import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { forgeBinary, PRIORITY, Trainer } from './trainer.mjs';

vi.mock('./uv.mjs', () => ({ findUv: () => '/fake/uv', UV_INSTALL: 'install uv' }));

function fakeChild() {
  const child = new EventEmitter();

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    if (child.closed) return;

    child.closed = true;
    child.emit('close', null, 'SIGTERM');
  };

  return child;
}

const closeStopped = (children) => {
  for (const child of children) {
    if (child.closed || !fs.existsSync(path.join(child.dir, 'stop'))) continue;

    child.closed = true;
    child.emit('close', 0, null);
  }
};

function trainer(options) {
  const library = fs.mkdtempSync(path.join(os.tmpdir(), 'trainer-'));
  const events = [];
  const children = [];
  const t = new Trainer(
    library,
    (e) => events.push(e),
    ({ dir }) => {
      const c = fakeChild();

      c.dir = dir;
      children.push(c);

      return c;
    },
    null,
  );

  if (options) t.useGateLease(options.leaseFile, options.leasePollMs);

  return { t, events, children };
}

const leaseFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lease-')), 'gate.lease');

const job = (name) => ({ name, task: 'walk' });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a job with demonstrations', () => {
  it('writes them to their own file beside job.json, which names it', () => {
    const { t, children } = trainer();
    const demos = { episodes: [{ obs: [[0.1]], actions: [[0.2]] }] };

    t.forge = '/fake/forge-train';
    t.start({ workspaceId: 'a', xml: '<m/>', job: { ...job('Touch a Point'), algo: 'bc', demos } });

    const { dir } = children[0];
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));

    expect(written).toMatchObject({ name: 'Touch a Point', algo: 'bc', demos: 'demos.json' });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'demos.json'), 'utf8'))).toEqual(demos);
  });

  it('refuses them without Forge, since train.py would train something else', () => {
    const { t, children } = trainer();

    expect(() => t.start({ workspaceId: 'a', xml: '<m/>', job: { ...job('Touch'), demos: { episodes: [] } } })).toThrow(
      /Forge/,
    );
    expect(children).toHaveLength(0);
  });
});

describe('the training queue', () => {
  it('runs one job at a time and starts the next when it ends', async () => {
    const { t, events, children } = trainer();

    t.start({ workspaceId: 'a', xml: '<m/>', job: job('Walk 1') });
    t.start({ workspaceId: 'b', xml: '<m/>', job: job('Walk 2') });

    expect(children).toHaveLength(1);
    expect(t.status().queued).toEqual(['b']);
    expect(events.at(-1).message).toBe('Queued. Starts after Walk 1.');

    children[0].emit('close', 0, null);
    await tick();

    expect(children).toHaveLength(2);
    expect(t.status().running).toEqual(['b']);
    expect(t.status().queued).toEqual([]);
  });

  it('puts user training ahead of background work', async () => {
    const { t, children } = trainer();

    t.start({ workspaceId: 'a', xml: '<m/>', job: job('Running') });
    t.start({ workspaceId: 'kit', xml: '<m/>', job: job('Kit'), priority: PRIORITY.kit });
    t.start({ workspaceId: 'user', xml: '<m/>', job: job('Mine') });

    expect(t.status().queued).toEqual(['user', 'kit']);
    children[0].emit('close', 0, null);
    await tick();
    expect(t.status().running).toEqual(['user']);
  });

  it('refuses a scene that is already running or queued', () => {
    const { t } = trainer();

    t.start({ workspaceId: 'a', xml: '<m/>', job: job('One') });
    t.start({ workspaceId: 'b', xml: '<m/>', job: job('Two') });
    expect(() => t.start({ workspaceId: 'a', xml: '<m/>', job: job('Again') })).toThrow(/already/);
    expect(() => t.start({ workspaceId: 'b', xml: '<m/>', job: job('Again') })).toThrow(/already/);
  });

  it('stopping a queued job removes it without touching the running one', () => {
    const { t, children, events } = trainer();

    t.start({ workspaceId: 'a', xml: '<m/>', job: job('One') });
    t.start({ workspaceId: 'b', xml: '<m/>', job: job('Two') });
    t.stop('b');

    expect(t.status().queued).toEqual([]);
    expect(t.status().running).toEqual(['a']);
    expect(children).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ workspaceId: 'b', kind: 'error', message: 'Training stopped.' });
  });

  it('reports a killed trainer as a crash, and an asked-for stop as a stop', async () => {
    const crashed = trainer();

    crashed.t.start({ workspaceId: 'a', xml: '<m/>', job: job('One') });
    crashed.children[0].emit('close', null, 'SIGSEGV');
    expect(crashed.events.at(-1).message).toContain('crashed');

    const stopped = trainer();

    stopped.t.start({ workspaceId: 'a', xml: '<m/>', job: job('One') });
    stopped.t.stop('a');
    stopped.children[0].emit('close', null, 'SIGTERM');
    expect(stopped.events.at(-1).message).toBe('Training stopped.');
  });
});

describe('background Kit work', () => {
  it('pauses a running Kit job when the user trains, then starts it again after', async () => {
    const { t, events, children } = trainer();

    t.start({ workspaceId: 'kit:a', xml: '<m/>', job: job('Kit'), priority: PRIORITY.kit });
    t.start({ workspaceId: 'mine', xml: '<m/>', job: job('Mine') });
    closeStopped(children);
    await tick();

    expect(t.status().running).toEqual(['mine']);
    expect(t.status().queued).toEqual(['kit:a']);
    expect(events.filter((e) => e.workspaceId === 'kit:a').map((e) => e.kind)).not.toContain('error');

    children[1].emit('close', 0, null);
    await tick();

    expect(t.status().running).toEqual(['kit:a']);
    expect(children).toHaveLength(3);
    expect(children[2].dir).toBe(children[0].dir);
    expect(fs.existsSync(path.join(children[2].dir, 'stop'))).toBe(false);
  });

  it('holds Kit jobs while the Gatekeeper lease exists, and user training runs anyway', async () => {
    const lease = leaseFile();
    const { t, children } = trainer({ leaseFile: lease, leasePollMs: 5 });

    fs.writeFileSync(lease, '1');
    t.start({ workspaceId: 'kit:a', xml: '<m/>', job: job('Kit'), priority: PRIORITY.kit });
    expect(t.status().running).toEqual([]);
    t.start({ workspaceId: 'mine', xml: '<m/>', job: job('Mine') });
    expect(t.status().running).toEqual(['mine']);
    t.stop('mine');
    closeStopped(children);
    await tick();
    expect(t.status().running).toEqual([]);

    fs.rmSync(lease);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(t.status().running).toEqual(['kit:a']);
    t.dispose();
  });

  it('pauses a running Kit job when the lease appears', async () => {
    const lease = leaseFile();
    const { t, children } = trainer({ leaseFile: lease, leasePollMs: 5 });

    t.start({ workspaceId: 'kit:a', xml: '<m/>', job: job('Kit'), priority: PRIORITY.kit });
    expect(t.status().running).toEqual(['kit:a']);
    fs.writeFileSync(lease, '1');
    await new Promise((resolve) => setTimeout(resolve, 30));
    closeStopped(children);
    expect(t.status().running).toEqual([]);
    expect(t.status().queued).toEqual(['kit:a']);
    t.dispose();
  });
});

describe('choosing the trainer', () => {
  it('prefers a bundled Forge binary and needs no Python then', () => {
    const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'res-'));
    const name = process.platform === 'win32' ? 'forge-train.exe' : 'forge-train';

    fs.mkdirSync(path.join(resources, 'forge'));
    fs.writeFileSync(path.join(resources, 'forge', name), '');
    expect(forgeBinary({}, resources)).toBe(path.join(resources, 'forge', name));

    const t = new Trainer(
      fs.mkdtempSync(path.join(os.tmpdir(), 'lib-')),
      () => {},
      () => fakeChild(),
      'forge',
    );

    expect(t.status()).toMatchObject({ ready: true, engine: 'forge' });
  });

  it('lets a developer force the Python trainer', () => {
    expect(forgeBinary({ BASECASE_TRAINER: 'python' }, '/nowhere')).toBeNull();
  });
});

describe('continuing from an earlier run', () => {
  const finishRun = (child, files) => {
    files.forEach((name) => fs.writeFileSync(path.join(child.dir, name), '{}'));
    child.emit('close', 0, null);
  };

  it('copies the earlier run into the new one and points the job at the copy', async () => {
    const { t, children } = trainer();
    const { jobId } = t.start({ workspaceId: 'a', xml: '<m/>', job: job('Stand 1') });

    finishRun(children[0], ['resume.json', 'policy.json']);
    await tick();
    t.start({ workspaceId: 'a', xml: '<m/>', job: { ...job('Stand 2'), warmStart: jobId } });

    const dir = children[1].dir;
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));

    expect(written.warmStart).toBe('warm');
    expect(fs.readdirSync(path.join(dir, 'warm')).sort()).toEqual(['policy.json', 'resume.json']);
  });

  it('refuses a warm start that is a path rather than an earlier run', () => {
    const { t, children } = trainer();

    for (const warmStart of ['/etc', '../policy-a', 'policy-a/../../x', 7]) {
      expect(() => t.start({ workspaceId: 'a', xml: '<m/>', job: { ...job('Walk'), warmStart } })).toThrow(
        'A warm start names an earlier training run.',
      );
    }

    expect(() => t.start({ workspaceId: 'a', xml: '<m/>', job: { ...job('Walk'), warmStart: 'policy-gone' } })).toThrow(
      'The run to continue from is gone.',
    );
    expect(children).toHaveLength(0);
  });

  it('keeps only the newest finished runs', async () => {
    const { t, children } = trainer();

    const clock = vi.spyOn(Date, 'now');

    for (let i = 0; i < 11; i++) {
      clock.mockReturnValue(1.8e12 + i * 1000);
      t.start({ workspaceId: 'a', xml: '<m/>', job: job(`Walk ${i}`) });
      finishRun(children[i], ['policy.json']);
      await tick();
    }

    clock.mockRestore();

    const left = fs.readdirSync(t.jobsDir);

    expect(left).toHaveLength(8);
    expect(left).toContain(path.basename(children[10].dir));
    expect(left).not.toContain(path.basename(children[0].dir));
  });
});
