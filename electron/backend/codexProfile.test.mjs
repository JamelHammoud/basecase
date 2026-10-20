import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { codexConfigToml, codexEnv, userDefaults } from './codexProfile.mjs';

const USER_CONFIG = `notify = ["/Applications/Some.app/client", "turn-ended"]
model = "gpt-6-astra"
model_reasoning_effort = "high"
sandbox_mode = "danger-full-access"
approval_policy = "never"

[features]
js_repl = false

[mcp_servers.node_repl]
command = "node"
`;

let dir;

afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

describe('codex profile', () => {
  it("carries the user's default model and effort, and nothing that widens access", () => {
    expect(userDefaults(USER_CONFIG)).toEqual({ model: 'gpt-6-astra', model_reasoning_effort: 'high' });

    const toml = codexConfigToml({ offline: true, userConfig: USER_CONFIG });

    expect(toml).toContain('model = "gpt-6-astra"');
    expect(toml).toContain('sandbox_mode = "read-only"');
    expect(toml).toContain('web_search = "disabled"');
    expect(toml).toContain('shell_tool = false');
    expect(toml).toContain('plugins = false');
    expect(toml).not.toMatch(/danger-full-access|approval_policy|mcp_servers|notify/);
  });

  it('runs Codex from its own home that shares only the login', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-profile-'));

    const userHome = path.join(dir, 'user');

    fs.mkdirSync(userHome);
    fs.writeFileSync(path.join(userHome, 'auth.json'), '{}');
    fs.writeFileSync(path.join(userHome, 'config.toml'), USER_CONFIG);

    const env = codexEnv({ offline: false, env: { CODEX_HOME: userHome }, configDir: path.join(dir, 'config') });

    expect(env.INITIAL_AGENT_MODE).toBe('read-only');
    expect(fs.readlinkSync(path.join(env.CODEX_HOME, 'auth.json'))).toBe(path.join(userHome, 'auth.json'));
    expect(fs.readFileSync(path.join(env.CODEX_HOME, 'config.toml'), 'utf-8')).toContain('web_search = "live"');
    expect(codexEnv({ offline: false, env: { CODEX_HOME: userHome }, configDir: path.join(dir, 'config') })).toEqual(
      env,
    );
  });
});
