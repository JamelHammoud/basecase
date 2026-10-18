const isHostSessionKey = (key) =>
  key === 'CLAUDECODE' ||
  key === 'CLAUDE_PID' ||
  key === 'CLAUDE_EFFORT' ||
  /^CLAUDE_(CODE|AGENT_SDK|PREVIEW)_/.test(key);

export function agentEnv(source = process.env) {
  const env = { ...source };
  const hosted = !!(env.CLAUDE_CODE_HOST_SESSION_ID || env.CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH);

  for (const key of Object.keys(env)) {
    if (isHostSessionKey(key)) delete env[key];
  }

  if (hosted) delete env.ANTHROPIC_BASE_URL;

  return env;
}

export function resolveCommand(command) {
  const parts = command.trim().split(/\s+/);

  if (parts[0] === 'node' && process.env.npm_node_execpath) parts[0] = process.env.npm_node_execpath;

  return parts;
}
