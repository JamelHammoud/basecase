import os from 'node:os';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const PERSONA_MODEL = process.env.PERSONA_MODEL || 'claude-opus-5-5';
export const PERSONA_EFFORT = process.env.PERSONA_EFFORT || 'high';

const SERVER = 'persona';
const GRACE_MS = 30000;
const MAX_TURNS = 600;
const NESTED_SESSION = /^CLAUDE_CODE_|^CLAUDECODE$|^ANTHROPIC_BASE_URL$/;

export function cleanEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !NESTED_SESSION.test(k)));
}

const asResult = (out) => ({
  content: [
    ...(out.image ? [{ type: 'image', data: out.image, mimeType: 'image/png' }] : []),
    { type: 'text', text: out.text },
  ],
});

const point = { x: z.number().describe('Screenshot x'), y: z.number().describe('Screenshot y') };

export function personaTools(h) {
  const run = (fn) => async (args) => asResult(await fn(args ?? {}));

  return [
    tool('look', 'Take a screenshot of the app.', {}, run(h.look)),
    tool('tree', 'Read the accessibility tree of the app.', {}, run(h.tree)),
    tool('click', 'Click at a point, then return a screenshot.', point, run(h.click)),
    tool('type', 'Type text into the focused field.', { text: z.string() }, run(h.type)),
    tool('press', 'Press a key such as Escape, Enter or Tab.', { key: z.string() }, run(h.press)),
    tool('scroll', 'Scroll what is under the pointer; positive dy scrolls down.', { dy: z.number() }, run(h.scroll)),
    tool('wait', 'Wait up to 10 seconds, then return a screenshot.', { seconds: z.number() }, run(h.wait)),
    tool(
      'report',
      'Report one usability problem on one control.',
      { where: z.string(), ...point, problem: z.string() },
      run(h.report),
    ),
    tool('withdraw', 'Withdraw an earlier finding, by its exact where.', { where: z.string() }, run(h.withdraw)),
    tool('finish', 'End the session.', {}, run(h.finish)),
  ];
}

export const toolNames = (tools) => tools.map((t) => `mcp__${SERVER}__${t.name}`);

function failure(message) {
  return new Error(
    `PersonaLab could not reach Claude (${message}). Sign in with the claude CLI on this machine, or set ANTHROPIC_API_KEY.`,
  );
}

async function drain(run, session) {
  for await (const message of run) {
    if (message.type === 'result' && message.is_error && !session.findings.length && !session.state.actions)
      throw failure(message.subtype);
  }
}

export async function untilDone({ work, ms, stop }) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });

  try {
    await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
    stop();
  }
}

export async function claudeDriver({ session, system, prompt }) {
  const tools = personaTools(session.handlers);
  const abortController = new AbortController();
  const options = {
    model: PERSONA_MODEL,
    effort: PERSONA_EFFORT,
    systemPrompt: system,
    tools: [],
    mcpServers: { [SERVER]: createSdkMcpServer({ name: SERVER, tools, alwaysLoad: true }) },
    allowedTools: toolNames(tools),
    permissionMode: 'dontAsk',
    strictMcpConfig: true,
    settingSources: [],
    persistSession: false,
    maxTurns: MAX_TURNS,
    cwd: os.tmpdir(),
    env: cleanEnv(),
    abortController,
  };

  const run = query({ prompt, options });
  const work = drain(run, session).catch((error) => {
    if (abortController.signal.aborted) return;

    throw error.message?.startsWith('PersonaLab') ? error : failure(error.message);
  });

  await untilDone({
    work,
    ms: session.timeLeft() + GRACE_MS,
    stop: () => {
      abortController.abort();
      run.close();
    },
  });
}
