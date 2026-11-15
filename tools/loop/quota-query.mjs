import { spawn } from 'node:child_process';
import { claudeWindows } from './lib/quotaWindows.mjs';
import { codexHome } from './lib/codexHome.mjs';

async function codex() {
  const child = spawn(process.env.CODEX_BIN || 'codex', ['app-server'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...process.env, ...codexHome() },
  });
  const pending = new Map();
  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk;

    const lines = buffer.split('\n');

    buffer = lines.pop();

    for (const line of lines) {
      try {
        const message = JSON.parse(line);

        pending.get(message.id)?.(message);
      } catch {
        continue;
      }
    }
  });

  const request = (id, method, params) =>
    new Promise((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });

  try {
    await request(0, 'initialize', { clientInfo: { name: 'basecase_loop_usage', version: '1.0.0' } });
    child.stdin.write('{"method":"initialized"}\n');

    const response = await request(1, 'account/rateLimits/read', {});
    const buckets = Object.values(response.result?.rateLimitsByLimitId ?? { codex: response.result?.rateLimits });

    return buckets.filter(Boolean).flatMap((bucket) =>
      [bucket.primary, bucket.secondary].filter(Boolean).map((window) => ({
        bucket: bucket.limitId,
        used: window.usedPercent,
        minutes: window.windowDurationMins,
        reset: window.resetsAt * 1000,
      })),
    );
  } finally {
    child.stdin.end();
    child.kill();
  }
}

async function claude() {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  let finish;
  const prompt = {
    async *[Symbol.asyncIterator]() {
      await new Promise((resolve) => {
        finish = resolve;
      });
      yield* [];
    },
  };
  const session = query({
    prompt,
    options: {
      tools: [],
      maxTurns: 1,
      pathToClaudeCodeExecutable: process.env.CLAUDE_BIN || 'claude',
      env: { ...process.env, ANTHROPIC_API_KEY: '' },
    },
  });

  try {
    const usage = await session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });

    return claudeWindows(usage);
  } finally {
    finish?.();
    session.close();
  }
}

const timeout = setTimeout(() => process.exit(1), 15_000);

try {
  const windows = await (process.argv[2] === 'claude' ? claude() : codex());

  process.stdout.write(JSON.stringify({ at: Date.now(), windows }));
} catch {
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
