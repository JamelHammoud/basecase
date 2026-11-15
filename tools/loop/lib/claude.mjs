import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './sh.mjs';
import { limitIn } from './usage.mjs';

export const sandboxArgs = ({ tools, allow }) => [
  '--restricted',
  '--strict-mcp-config',
  '--tools',
  tools.join(','),
  '--permission-mode',
  'dontAsk',
  '--allowedTools',
  allow.join(','),
];

export function withoutGithub(fn) {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-nogh-'));

  try {
    return fn({ GH_TOKEN: '', GITHUB_TOKEN: '', GH_ENTERPRISE_TOKEN: '', GH_CONFIG_DIR: empty });
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
}

export function runClaude({ cwd, name, brief, prompt, schema, hours, sandbox, policy }, execute = run) {
  const args = [
    '-p',
    prompt,
    '--append-system-prompt',
    brief,
    '--model',
    policy.claudeModel,
    '--effort',
    policy.claudeEffort,
    ...(name === 'voice' ? ['--safe-mode'] : []),
    ...(sandbox ? sandboxArgs(sandbox) : ['--dangerously-skip-permissions']),
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
    '--no-session-persistence',
  ];
  const launch = (env) =>
    execute(process.env.CLAUDE_BIN || 'claude', args, {
      cwd,
      env: { ...env, ANTHROPIC_API_KEY: '' },
      timeout: hours * 60 * 60 * 1000,
      allowFail: true,
    });
  const response = sandbox ? withoutGithub(launch) : launch();

  return claudeAnswer(response);
}

function claudeAnswer(response) {
  const limited = limitIn(response);

  if (limited) return { ok: false, limited };

  if (!response.ok) return { ok: false, error: response.err || 'Claude process failed' };

  try {
    const parsed = JSON.parse(response.out);
    const events = Array.isArray(parsed) ? parsed : [parsed];
    const result = events.findLast((event) => event?.type === 'result');
    const usable = result && !result.is_error && result.structured_output;

    return usable
      ? { ok: true, output: result.structured_output, usage: result.usage, modelUsage: result.modelUsage }
      : { ok: false, error: result?.result || response.err };
  } catch (error) {
    return { ok: false, error: `${error.message}: ${(response.err || response.out).slice(-1000)}` };
  }
}
