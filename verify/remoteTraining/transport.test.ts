import loadMujoco from '@mujoco/mujoco';
import { afterAll, beforeAll, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { RemoteTraining } from '../../electron/remoteTraining/index.mjs';
import { runSsh } from '../../electron/remoteTraining/config.mjs';
import { writeJobFolder } from '../../electron/trainer.mjs';
import { fixtureModel } from '../../src/skills/fixtureModels';
import { kitJob } from '../../src/skills/kitJob';
import { kitEnvironment } from '../../src/skills/kitEnvironment';
import { runArena } from '../../src/skills/arena';
import { isPolicySpec } from '../../src/sim/policy';
import { environmentHash } from '../../src/skills/environment';
import { RemoteTrainer } from '../../electron/remoteTrainer.mjs';
import { selectSeeds, selectionOf } from '../../src/skills/seedSelection';
import { seedDevelopment } from '../../src/skills/seedDevelopment';

const name = `basecase-training-${process.pid}`;
const fixtureHome = '/srv/basecase-training';
const sshDir = path.posix.join(fixtureHome, '.ssh');
const pidFile = path.posix.join(fixtureHome, '.local/share/basecase/training/policy-remote-cpu/pid');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase ssh training '));
const key = path.join(dir, 'identity with spaces');
const secrets = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(text).toString('base64'),
  decrypt: (text: string) => Buffer.from(text, 'base64').toString(),
};
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim();

beforeAll(() => {
  execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', key], { stdio: 'ignore' });
  docker('run', '--detach', '--name', name, 'basecase-training-fixture');
  docker('exec', name, 'mkdir', '-p', sshDir);
  docker('cp', `${key}.pub`, `${name}:${path.posix.join(sshDir, 'authorized_keys')}`);
  docker('exec', name, 'chown', '-R', 'trainer:trainer', sshDir);
  docker('exec', name, 'chmod', '700', sshDir);
  docker('exec', name, 'chmod', '600', path.posix.join(sshDir, 'authorized_keys'));
  docker('exec', name, '/usr/sbin/sshd');
});

afterAll(() => {
  docker('rm', '--force', name);
  fs.rmSync(dir, { recursive: true, force: true });
});

it('trains through sshd, reattaches to the detached job, downloads verified artifacts and judges locally', async () => {
  const host = docker('inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', name);
  const hostKey = docker('exec', name, 'cat', '/etc/ssh/ssh_host_ed25519_key.pub').split(' ').slice(0, 2).join(' ');
  let loseAcknowledgment = true;
  const service = new RemoteTraining({
    libraryDir: dir,
    secrets,
    run: async (request) => {
      const output = await runSsh(request);

      if (loseAcknowledgment && request.input.includes('nohup sh run.sh')) {
        loseAcknowledgment = false;

        throw Object.assign(new Error('The dispatch acknowledgment was lost.'), { reconnect: true });
      }

      return output;
    },
  });

  await service.configure({ host, user: 'trainer', key, hostKey });

  const model = fixtureModel('quad-servo');
  const job = { ...kitJob(model, 'stand', { minutes: 1, seed: 1, maxIterations: 1 }), envs: 8, threads: 1 };
  const jobDir = path.join(dir, 'training', 'policy-remote-cpu');

  writeJobFolder(jobDir, { xml: model.xml, job });

  const descriptor = await service.prepare({
    id: 'policy-remote-cpu',
    dir: jobDir,
    workspaceId: 'fixture',
    fingerprint: model.xml,
  });

  await expect(service.dispatch(descriptor)).rejects.toMatchObject({ reconnect: true });

  const pid = docker('exec', name, 'cat', pidFile);
  const recovered = new RemoteTraining({ libraryDir: dir, secrets });
  const saved = recovered.descriptors()[0];

  expect(saved.id).toBe(descriptor.id);
  await recovered.dispatch(saved);
  expect(docker('exec', name, 'cat', pidFile)).toBe(pid);

  let result = await recovered.poll(saved);

  const deadline = Date.now() + 60_000;

  while (result.state === 'running' && Date.now() < deadline) {
    await setTimeout(100);
    result = await recovered.poll(saved);
  }

  expect(result.state, result.stderr).toBe('done');

  const policy: unknown = JSON.parse(fs.readFileSync(path.join(jobDir, 'policy.json'), 'utf8'));

  expect(isPolicySpec(policy)).toBe(true);
  expect(fs.existsSync(path.join(jobDir, 'resume.json'))).toBe(true);

  if (!isPolicySpec(policy)) throw new Error('Remote Forge returned an unreadable policy.');

  const mj = await loadMujoco();
  const environment = kitEnvironment(model, 'stand');
  const evidence = await runArena({
    mj,
    model,
    environment,
    contract: environment.contract,
    controller: { kind: 'policy', policy, robot: model.robots[0].key },
  });

  expect(evidence.binding.environment).toBe(environmentHash(environment));
  expect(evidence.variants.map((variant) => variant.trials)).toEqual([32, 32, 32]);
  expect(typeof evidence.passed).toBe('boolean');

  await expect(
    new RemoteTraining({ libraryDir: path.join(dir, 'wrong-key'), secrets }).configure({
      host,
      user: 'trainer',
      key,
      hostKey: fs.readFileSync(`${key}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' '),
    }),
  ).rejects.toThrow();
});

const resourceScript = `set -eu
for process in /proc/[0-9]*; do
  test "$(cat "$process/comm" 2>/dev/null)" = forge-train || continue
  awk '/VmHWM:/{rss=$2} /Threads:/{threads=$2} END{printf "%d %d\\n", rss, threads}' "$process/status" 2>/dev/null || true
done
`;

async function configuredService(label: string, concurrency: number) {
  const host = docker('inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', name);
  const hostKey = docker('exec', name, 'cat', '/etc/ssh/ssh_host_ed25519_key.pub').split(' ').slice(0, 2).join(' ');
  const service = new RemoteTraining({ libraryDir: path.join(dir, label), secrets });

  await service.configure({ host, user: 'trainer', key, hostKey, attempts: 2, concurrency });

  return service;
}

async function sampleResources(service: RemoteTraining) {
  const computer = service.configuration()!.computer;
  const text = await service.execute(computer, resourceScript);
  const rows = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' ').map(Number));

  return {
    rssKb: rows.reduce((sum, row) => sum + row[0], 0),
    threads: rows.reduce((sum, row) => sum + row[1], 0),
    processes: rows.length,
  };
}

async function waitGroup(trainer: RemoteTrainer, service: RemoteTraining) {
  const peak = { rssKb: 0, threads: 0, processes: 0 };

  while (!trainer.remoteEntries[0].outcome) {
    const resources = await sampleResources(service);

    peak.rssKb = Math.max(peak.rssKb, resources.rssKb);
    peak.threads = Math.max(peak.threads, resources.threads);
    peak.processes = Math.max(peak.processes, resources.processes);

    await setTimeout(100);
  }

  return peak;
}

async function cpuComparison(concurrency: number) {
  const label = `workers-${concurrency}`;
  const service = await configuredService(label, concurrency);
  const trainer = new RemoteTrainer({ libraryDir: path.join(dir, label), remote: service, emit: () => {} });
  const model = fixtureModel('quad-servo');
  const job = { ...kitJob(model, 'stand', { minutes: 1, seed: 31, maxIterations: 8 }), envs: 8, threads: 1 };
  const started = performance.now();

  try {
    trainer.start({ workspaceId: 'skill:cpu', recoveryKey: 'cpu:0', xml: model.xml, job });

    const peak = await waitGroup(trainer, service);
    const entry = trainer.remoteEntries[0];

    expect(entry.outcome.kind).toBe('done');
    expect(new Set(entry.children.map((child) => child.id)).size).toBe(2);
    expect(entry.children.every((child) => child.outcome.kind === 'done')).toBe(true);

    const mj = await loadMujoco();
    const environment = kitEnvironment(model, 'stand');
    const candidates = entry.outcome.candidates.map((child) => ({ ...child, policy: trainer.getPolicy(child.id) }));
    const outcome = await selectSeeds(
      { ok: true, policy: null, candidates, events: [], stderr: '' },
      seedDevelopment({ mj, model, environment }),
    );

    if (!outcome.policy) throw new Error('The CPU fixture produced no development candidate.');

    expect(service.recordSelection(selectionOf(outcome.policy)!)).toBe(true);

    const evidence = await runArena({
      mj,
      model,
      environment,
      contract: environment.contract,
      controller: { kind: 'policy', policy: outcome.policy, robot: model.robots[0].key },
      salt: new Uint8Array(32).fill(17),
    });
    const diskKb = Number(
      (
        await service.execute(
          service.configuration()!.computer,
          'du -sk "$HOME/.local/share/basecase/training" | cut -f 1',
        )
      ).trim(),
    );

    return {
      concurrency,
      wallMs: performance.now() - started,
      steps: entry.outcome.candidates.reduce((sum, child) => sum + child.steps, 0),
      peak,
      diskKb,
      localPassed: evidence.passed,
    };
  } finally {
    trainer.dispose();
  }
}

it('compares one and two CPU workers with identical aggregate work and reports local outcomes', async () => {
  const one = await cpuComparison(1);
  const two = await cpuComparison(2);

  expect(one.steps).toBeGreaterThan(0);
  expect(two.steps).toBe(one.steps);
  expect(one.peak.processes).toBeLessThanOrEqual(1);
  expect(two.peak.processes).toBeLessThanOrEqual(2);
  process.stdout.write(
    `Remote seed CPU comparison: ${JSON.stringify({ one, two, memory: 'Sampled /proc VmHWM, summed across active trainers' })}\n`,
  );
});

it('stops every real grouped child through stop files and retains no candidate', async () => {
  const service = await configuredService('cancel-group', 2);
  const trainer = new RemoteTrainer({ libraryDir: path.join(dir, 'cancel-group'), remote: service, emit: () => {} });
  const model = fixtureModel('quad-servo');
  const job = { ...kitJob(model, 'stand', { minutes: 1, seed: 31, maxIterations: 10000 }), envs: 8, threads: 1 };

  try {
    trainer.start({ workspaceId: 'skill:cancel', recoveryKey: 'cancel:0', xml: model.xml, job });

    while (!trainer.remoteEntries[0].outcome && !trainer.remoteEntries[0].children.every((child) => child.dispatching))
      await setTimeout(20);

    trainer.stop('skill:cancel');
    await waitGroup(trainer, service);
    expect(trainer.remoteEntries[0].outcome).toMatchObject({ kind: 'error', message: 'Training stopped.' });
  } finally {
    trainer.dispose();
  }
});
