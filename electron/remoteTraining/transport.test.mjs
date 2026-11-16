import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RemoteTraining } from './index.mjs';
import { sha256 } from './bundle.mjs';
import { dispatchScript, inputManifest, remoteDirectory } from './scripts.mjs';

const dirs = [];
const secrets = {
  available: () => true,
  encrypt: (text) => Buffer.from(text).toString('base64'),
  decrypt: (text) => Buffer.from(text, 'base64').toString(),
};
const artifact = (text) => ({ hash: sha256(Buffer.from(text)), data: Buffer.from(text).toString('base64') });
const reply = (fields = {}) => JSON.stringify({ state: 'running', code: 0, log: '', ...fields });

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-training-'));
  const calls = [];
  const responses = ['Linux x86_64\n'];
  const run = async (request) => {
    calls.push(request);

    return responses.shift() ?? reply();
  };

  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'identity'), 'fixture');

  const service = new RemoteTraining({
    libraryDir: dir,
    secrets,
    run,
    bundle: async () => ({ 'forge-train': Buffer.from('trainer'), 'libmujoco.so.4.0.0': Buffer.from('runtime') }),
  });
  const config = {
    host: 'fixture.example',
    user: 'trainer',
    key: path.join(dir, 'identity'),
    hostKey: `ssh-ed25519 ${Buffer.alloc(32, 1).toString('base64')}`,
  };

  return { dir, calls, responses, service, config };
}

async function prepared(f) {
  await f.service.configure(f.config);

  const dir = path.join(f.dir, 'training', 'policy-fixture');

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'model.xml'), '<mujoco/>');
  fs.writeFileSync(path.join(dir, 'job.json'), '{"name":"Stand"}');

  return f.service.prepare({ id: 'policy-fixture', dir, workspaceId: 'skill:fixture', fingerprint: 'exact-inputs' });
}

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('durable remote training', () => {
  it('persists sealed computer and exact inputs before dispatch and recovers the same identity', async () => {
    const f = fixture();
    const descriptor = await prepared(f);
    const stored = fs.readFileSync(path.join(descriptor.dir, 'remote.json'), 'utf8');

    expect(f.calls).toHaveLength(1);
    expect(stored).not.toContain(f.config.key);
    expect(stored).not.toContain(f.config.user);
    expect(descriptor.inputHashes['model.xml']).toBe(sha256(Buffer.from('<mujoco/>')));

    const reloaded = new RemoteTraining({ libraryDir: f.dir, secrets, run: async () => reply() });

    expect(reloaded.descriptors()).toEqual([descriptor]);
    expect(reloaded.status()).not.toHaveProperty('key');
    f.service.clear();
    expect(f.service.selected()).toBe(false);
    expect(f.service.descriptors()).toHaveLength(1);
  });

  it('repeated dispatch uses a remote atomic started lock and refuses changed inputs', async () => {
    const f = fixture();
    const descriptor = await prepared(f);

    await f.service.dispatch(descriptor);
    await f.service.dispatch(descriptor);
    expect(f.calls[1].input).toContain('if test -d started; then exit 0; fi');
    expect(f.calls[1].input).toContain('if mkdir started 2>/dev/null; then');
    expect(f.calls[1].input).toContain('sha256sum --check --status');
    fs.writeFileSync(path.join(descriptor.dir, 'model.xml'), 'changed');
    await expect(f.service.dispatch(descriptor)).rejects.toThrow('frozen');
  });

  it('downloads policy and resume after checks and writes Stop on the existing job after restart', async () => {
    const f = fixture();
    const descriptor = await prepared(f);

    f.responses.push(
      reply({ state: 'done', 'policy.json': artifact('{"policy":1}'), 'resume.json': artifact('{"resume":1}') }),
    );

    const outcome = await f.service.poll(descriptor);

    expect(outcome.state).toBe('done');
    expect(JSON.parse(fs.readFileSync(path.join(descriptor.dir, 'policy.json'), 'utf8'))).toEqual({ policy: 1 });
    expect(JSON.parse(fs.readFileSync(path.join(descriptor.dir, 'resume.json'), 'utf8'))).toEqual({ resume: 1 });
    await f.service.stop(descriptor);
    expect(f.calls.at(-1).input).toContain(': > stop');
    f.service.markCompleted(descriptor);
    expect(f.service.descriptors()).toEqual([]);
  });

  it('downloads a cloning policy without requiring a PPO resume artifact', async () => {
    const f = fixture();
    const descriptor = await prepared(f);

    descriptor.cloning = true;
    f.responses.push(reply({ state: 'done', 'policy.json': artifact('{"policy":1}') }));
    expect((await f.service.poll(descriptor)).state).toBe('done');
    expect(fs.existsSync(path.join(descriptor.dir, 'policy.json'))).toBe(true);
    expect(fs.existsSync(path.join(descriptor.dir, 'resume.json'))).toBe(false);
  });

  it('refuses corrupted or oversized artifacts before replacing either local file', async () => {
    const f = fixture();
    const descriptor = await prepared(f);
    const policy = artifact('{"policy":1}');
    const resume = { ...artifact('{"resume":1}'), hash: '0'.repeat(64) };

    f.responses.push(reply({ state: 'done', 'policy.json': policy, 'resume.json': resume }));
    await expect(f.service.poll(descriptor)).rejects.toThrow('verification');
    expect(fs.existsSync(path.join(descriptor.dir, 'policy.json'))).toBe(false);
  });

  it('reports remote process failure and treats remote readiness claims as data', async () => {
    const f = fixture();
    const descriptor = await prepared(f);

    f.responses.push(
      reply({ state: 'done', code: 1, log: Buffer.from('{"type":"done","ready":true}\n').toString('base64') }),
    );
    expect((await f.service.poll(descriptor)).state).toBe('failed');
    expect(fs.existsSync(path.join(descriptor.dir, 'policy.json'))).toBe(false);
  });

  it('refuses hostile job and input names before spawning', () => {
    expect(() => remoteDirectory('policy-a;id')).toThrow();
    expect(() => remoteDirectory('../policy-fixture')).toThrow();
    expect(() => inputManifest({ '../policy.json': '0'.repeat(64) })).toThrow();
    expect(() => dispatchScript({ id: '../host', inputHashes: {} }, {})).toThrow();
  });
});
