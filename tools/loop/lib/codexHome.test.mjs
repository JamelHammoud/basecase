import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-codex-home-'));
const source = path.join(directory, 'personal');

fs.mkdirSync(source);
fs.writeFileSync(path.join(source, 'auth.json'), '{"auth_mode":"chatgpt"}');
fs.writeFileSync(path.join(source, 'config.toml'), '[mcp_servers.personal]\ncommand="personal-tool"\n');
vi.stubEnv('BASECASE_LOOP_DIR', directory);
vi.stubEnv('CODEX_HOME', source);

const { codexHome } = await import('./codexHome.mjs');

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('isolated loop profile', () => {
  it('shares the subscription login while excluding personal connectors and API-key overrides', () => {
    const env = codexHome({ OPENAI_API_KEY: 'test-key' });
    const config = fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf8');

    expect(env.OPENAI_API_KEY).toBe('');
    expect(fs.readFileSync(path.join(env.CODEX_HOME, 'auth.json'), 'utf8')).toBe('{"auth_mode":"chatgpt"}');
    expect(config).toContain('plugins = false');
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
