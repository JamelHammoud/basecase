import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-codex-home-'));
const source = path.join(directory, 'personal');

fs.mkdirSync(source);
fs.writeFileSync(path.join(source, 'auth.json'), '{"auth_mode":"chatgpt"}');
fs.writeFileSync(path.join(source, 'config.toml'), '[mcp_servers.personal]\ncommand="personal-tool"\n');
vi.stubEnv('BASECASE_LOOP_DIR', directory);
vi.stubEnv('CODEX_HOME', source);

const { codexHome } = await import('./codexHome.mjs');
const { held } = await import('./claim.mjs');

afterEach(() => vi.restoreAllMocks());

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('isolated loop profile', () => {
  it('holds the shared profile claim while replacing config and releases it on failure', () => {
    const rename = fs.renameSync;
    const replace = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      expect(held('codex-home-auth')).toBe(true);

      return rename(from, to);
    });

    codexHome();
    expect(replace).toHaveBeenCalled();
    expect(held('codex-home-auth')).toBe(false);
    replace.mockImplementation(() => {
      throw Object.assign(new Error('Windows config replacement refused'), { code: 'EPERM' });
    });
    expect(() => codexHome()).toThrow('Windows config replacement refused');
    expect(held('codex-home-auth')).toBe(false);
    replace.mockRestore();
    expect(() => codexHome()).not.toThrow();
  });

  it('shares the subscription login while excluding personal connectors and API-key overrides', () => {
    const env = codexHome({ OPENAI_API_KEY: 'test-key', CODEX_API_KEY: 'test-codex-key' });
    const config = fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf8');

    expect(env.OPENAI_API_KEY).toBe('');
    expect(env.CODEX_API_KEY).toBe('');
    expect(fs.readFileSync(path.join(env.CODEX_HOME, 'auth.json'), 'utf8')).toBe('{"auth_mode":"chatgpt"}');
    expect(config).toContain('plugins = false');
    expect(config).toContain('multi_agent = false');
    expect(config).toContain('multi_agent_v2 = false');
    expect(config).not.toContain('personal-tool');
    expect(fs.readFileSync(path.join(source, 'config.toml'), 'utf8')).toContain('personal-tool');
  });

  it('initializes safely when several lanes start at once', async () => {
    const execute = promisify(execFile);
    const code = `import {codexHome} from ${JSON.stringify(new URL('./codexHome.mjs', import.meta.url).href)}; codexHome();`;

    await Promise.all(
      Array.from({ length: 4 }, () =>
        execute(process.execPath, ['--input-type=module', '-e', code], { env: process.env }),
      ),
    );

    expect(fs.readFileSync(path.join(directory, 'state', 'codex-home', 'config.toml'), 'utf8')).toContain(
      'service_tier = "default"',
    );
  });
});
