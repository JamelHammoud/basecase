import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRuntimes, PLATFORM, runtimeEntries, runtimeSpec, tarBinary } from './agentRuntimes.mjs';

const spec = runtimeSpec('claude');
let tmp;

function tarball(file = spec.executable) {
  const pkg = path.join(tmp, 'src', 'package');

  fs.mkdirSync(path.dirname(path.join(pkg, file)), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  fs.writeFileSync(path.join(pkg, file), '#!/bin/sh\n', { mode: 0o755 });

  const tgz = path.join(tmp, 'package.tgz');

  execFileSync(tarBinary(), ['-czf', tgz, '-C', path.join(tmp, 'src'), 'package']);

  return fs.readFileSync(tgz);
}

function setup(bytes, { pkg = spec.pkg, integrity } = {}) {
  const manifest = path.join(tmp, 'agent-runtimes.json');
  const resolved = `https://registry.npmjs.org/${pkg}/-/cli-1.0.0.tgz`;
  const checksum = integrity ?? `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
  const calls = [];

  fs.writeFileSync(manifest, JSON.stringify({ [pkg]: { version: '1.0.0', resolved, integrity: checksum } }));

  const fetchImpl = async (url) => {
    calls.push(url);

    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
  };
  const runtimes = new AgentRuntimes({
    root: path.join(tmp, 'app'),
    dir: path.join(tmp, 'agents'),
    manifest,
    fetchImpl,
  });

  return { runtimes, calls };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-runtimes-'));
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('agent runtimes', () => {
  it('downloads the pinned CLI once, checks it and points the adapter at it', async () => {
    const { runtimes, calls } = setup(tarball());
    const progress = [];
    const runtime = await runtimes.ensure('claude', (p) => progress.push(p.received));
    const executable = runtime.env[spec.env];

    expect(executable).toBe(
      path.join(tmp, 'agents', PLATFORM, `${spec.pkg.replace('/', '+')}@1.0.0`, 'package', spec.executable),
    );
    expect(fs.existsSync(executable)).toBe(true);
    expect(progress.length).toBeGreaterThan(0);
    expect((await runtimes.ensure('claude')).env).toEqual(runtime.env);
    expect(calls).toHaveLength(1);
  });

  it('refuses a download that doesn’t match the lockfile checksum and leaves nothing behind', async () => {
    const { runtimes } = setup(tarball(), { integrity: 'sha512-AAAA' });

    await expect(runtimes.ensure('claude')).rejects.toThrow('checksum');
    expect(fs.readdirSync(path.join(tmp, 'agents', PLATFORM))).toEqual([]);
  });

  it('uses the CLI in node_modules when running from source', async () => {
    const { runtimes, calls } = setup(Buffer.alloc(0));

    fs.mkdirSync(path.join(tmp, 'app', 'node_modules', spec.pkg), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'app', 'node_modules', spec.pkg, 'package.json'), '{}');

    expect((await runtimes.ensure('claude')).env).toEqual({});
    expect(calls).toEqual([]);
  });

  it('points Gemini’s script at the download and leaves other arguments alone', async () => {
    const gemini = runtimeSpec('gemini');
    const { runtimes } = setup(tarball('bundle/gemini.js'), { pkg: gemini.pkg });
    const runtime = await runtimes.ensure('gemini');
    const script = runtime.arg('node_modules/@google/gemini-cli/bundle/gemini.js');

    expect(fs.existsSync(script)).toBe(true);
    expect(runtime.arg('--acp')).toBe('--acp');
    expect(runtime.env).toEqual({});
    expect(
      await new AgentRuntimes({ root: tmp, dir: tmp, manifest: path.join(tmp, 'none.json') }).ensure('offline'),
    ).toEqual(expect.objectContaining({ env: {} }));
    await expect(
      new AgentRuntimes({ root: tmp, dir: tmp, manifest: path.join(tmp, 'none.json') }).ensure('codex'),
    ).rejects.toThrow('isn’t available');
  });

  it('pins every agent CLI for the platforms Basecase ships', () => {
    const lock = JSON.parse(fs.readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
    const platforms = ['darwin-arm64', 'win32-x64'];
    const entries = runtimeEntries(lock, platforms);

    for (const platform of platforms) {
      for (const kind of ['claude', 'codex', 'gemini']) {
        expect(entries[runtimeSpec(kind, platform).pkg]?.integrity).toMatch(/^sha512-/);
      }
    }
  });

  it('pins the same CLI each adapter runs from source', () => {
    const lock = JSON.parse(fs.readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
    const adapters = {
      '@agentclientprotocol/claude-agent-acp': '@anthropic-ai/claude-agent-sdk',
      '@agentclientprotocol/codex-acp': '@openai/codex',
    };

    for (const [adapter, cli] of Object.entries(adapters)) {
      const nested = Object.keys(lock.packages).filter((key) =>
        key.startsWith(`node_modules/${adapter}/node_modules/${cli}`),
      );

      expect(nested).toEqual([]);
    }
  });
});
