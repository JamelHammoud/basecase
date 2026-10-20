import fs from 'node:fs';
import path from 'node:path';

export const CAD_MCP_SERVER = 'robotics_cad';

export function geminiSettings({ offline, apiKey }) {
  return {
    ...(apiKey ? { security: { auth: { selectedType: 'gemini-api-key' }, folderTrust: { enabled: false } } } : {}),
    tools: { core: offline ? ['write_todos'] : ['write_todos', 'web_fetch', 'google_web_search'] },
    mcp: { allowed: [CAD_MCP_SERVER] },
    ...(apiKey ? {} : { security: { folderTrust: { enabled: false } } }),
    general: { checkpointing: { enabled: false } },
  };
}

export function geminiEnv({ offline, configDir, instructions, apiKey }) {
  const systemPath = path.join(configDir, 'gemini-system.md');
  const settingsPath = path.join(configDir, 'gemini-settings.json');

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(systemPath, instructions, 'utf-8');
  fs.writeFileSync(settingsPath, JSON.stringify(geminiSettings({ offline, apiKey }), null, 2), 'utf-8');

  return {
    GEMINI_SYSTEM_MD: systemPath,
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: settingsPath,
    ...(apiKey ? { GEMINI_API_KEY: apiKey } : {}),
  };
}
