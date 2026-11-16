import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shareAuth } from '../../../electron/backend/codexProfile.mjs';
import { LOOP_DIR } from './paths.mjs';
import { claimWithin } from './claim.mjs';

const CONFIG = [
  'check_for_update_on_startup = false',
  'web_search = "cached"',
  'service_tier = "default"',
  '[features]',
  ...[
    'apps',
    'plugins',
    'browser_use',
    'browser_use_external',
    'in_app_browser',
    'computer_use',
    'image_generation',
    'memories',
    'goals',
    'worktrees',
    'multi_agent',
    'multi_agent_v2',
  ].map((name) => `${name} = false`),
].join('\n');

export function codexHome(env = {}) {
  const source = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const home = path.join(LOOP_DIR, 'state', 'codex-home');
  const temporary = path.join(home, `config.${process.pid}.tmp`);

  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.writeFileSync(temporary, `${CONFIG}\n`, { mode: 0o600 });
  fs.renameSync(temporary, path.join(home, 'config.toml'));

  const release = claimWithin('codex-home-auth', { ms: 1000, every: 10 });

  if (!release) throw new Error('Codex login sharing is busy');

  try {
    shareAuth(source, home);
  } finally {
    release();
  }

  return { ...env, CODEX_HOME: home, OPENAI_API_KEY: '', CODEX_API_KEY: '' };
}
