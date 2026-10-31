import fs from 'node:fs';
import path from 'node:path';
import { splitCommand } from '../executables.mjs';

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

  env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';
  env.CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS = '1';
  env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = '1';
  env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS = '1';
  env.ENABLE_CLAUDEAI_MCP_SERVERS = 'false';
  env.MAX_MCP_OUTPUT_TOKENS = '40000';

  if (nodeRuntime(source).asNode) env.ELECTRON_RUN_AS_NODE = '1';

  return env;
}

export function nodeRuntime(env = process.env) {
  if (env.npm_node_execpath) return { command: env.npm_node_execpath, asNode: false };

  if (env.BASECASE_NODE) return { command: env.BASECASE_NODE, asNode: env.BASECASE_NODE === process.execPath };

  return { command: 'node', asNode: false };
}

const isLocalPath = (arg, root) => !arg.startsWith('-') && !path.isAbsolute(arg) && fs.existsSync(path.join(root, arg));

export function anchorArgs(args, root) {
  return args.map((arg) => (isLocalPath(arg, root) ? path.join(root, arg) : arg));
}

export function resolveCommand(command) {
  const parts = splitCommand(command);

  if (parts[0] === 'node') parts[0] = nodeRuntime().command;

  return parts;
}
