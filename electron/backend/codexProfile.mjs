import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLOSED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'shell_snapshot',
  'apps',
  'plugins',
  'tool_suggest',
  'browser_use',
  'browser_use_external',
  'in_app_browser',
  'computer_use',
  'image_generation',
  'memories',
  'goals',
  'worktrees',
];

const CARRIED_KEYS = ['model', 'model_reasoning_effort', 'model_provider', 'service_tier'];

const TOP_LEVEL_STRING = /^\s*([A-Za-z_]+)\s*=\s*("(?:[^"\\]|\\.)*")\s*$/;

export function userDefaults(configText) {
  const defaults = {};

  for (const line of configText.split('\n')) {
    if (/^\s*\[/.test(line)) break;

    const match = line.match(TOP_LEVEL_STRING);

    if (match && CARRIED_KEYS.includes(match[1])) defaults[match[1]] = JSON.parse(match[2]);
  }

  return defaults;
}

const tomlValue = (value) => (Array.isArray(value) ? `[${value.map(tomlValue).join(', ')}]` : JSON.stringify(value));

const tomlLines = (entries) => Object.entries(entries).map(([key, value]) => `${key} = ${tomlValue(value)}`);

export function codexConfigToml({ offline, userConfig }) {
  return [
    ...tomlLines({
      ...userDefaults(userConfig),
      sandbox_mode: 'read-only',
      web_search: offline ? 'disabled' : 'live',
      project_doc_max_bytes: 0,
      model_reasoning_summary: 'detailed',
      hide_agent_reasoning: false,
      check_for_update_on_startup: false,
    }),
    '',
    '[features]',
    ...tomlLines(Object.fromEntries(CLOSED_FEATURES.map((name) => [name, false]))),
    '',
  ].join('\n');
}

const userHome = (env) => env.CODEX_HOME || path.join(os.homedir(), '.codex');

function readUserConfig(home) {
  try {
    return fs.readFileSync(path.join(home, 'config.toml'), 'utf-8');
  } catch {
    return '';
  }
}

function linkAuth(home, ownHome) {
  const source = path.join(home, 'auth.json');
  const target = path.join(ownHome, 'auth.json');

  if (!fs.existsSync(source)) return;

  try {
    if (fs.readlinkSync(target) === source) return;
  } catch {}

  fs.rmSync(target, { force: true });
  fs.symlinkSync(source, target);
}

export function codexEnv({ offline, env, configDir }) {
  const home = userHome(env);
  const ownHome = path.join(configDir, 'codex-home');

  fs.mkdirSync(ownHome, { recursive: true });
  fs.writeFileSync(path.join(ownHome, 'config.toml'), codexConfigToml({ offline, userConfig: readUserConfig(home) }));
  linkAuth(home, ownHome);

  return { INITIAL_AGENT_MODE: 'read-only', CODEX_HOME: ownHome };
}

export const codexSessionMeta = (instructions) => ({ jetbrains: { air: { customInstructions: instructions } } });
