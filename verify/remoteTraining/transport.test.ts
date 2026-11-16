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
