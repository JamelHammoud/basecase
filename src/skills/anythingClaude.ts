type Env = Record<string, string | undefined>;

interface SdkMessage {
  type: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
}

interface Sdk {
  query: (input: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<SdkMessage> & {
    close?: () => void;
  };
}

const SDK = '@anthropic-ai/claude-agent-sdk';
const OS = 'node:os';
const NESTED_SESSION = /^CLAUDE_CODE_|^CLAUDECODE$|^ANTHROPIC_BASE_URL$/;
const CALL_MS = 6 * 60 * 1000;

const processEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {};

export const INTENT_MODEL = () => processEnv().ANYTHING_MODEL || 'claude-opus-5-5';
export const INTENT_EFFORT = () => processEnv().ANYTHING_EFFORT || 'high';

const cleanEnv = (env: Env) => Object.fromEntries(Object.entries(env).filter(([k]) => !NESTED_SESSION.test(k)));

export type Ask = (request: { system: string; prompt: string; signal?: AbortSignal }) => Promise<string>;

async function drain(run: AsyncIterable<SdkMessage>): Promise<string> {
  let text = '';

  for await (const message of run) {
    if (message.type !== 'result') continue;

    if (message.is_error) throw new Error(`Claude stopped: ${message.subtype ?? 'error'}`);

    text = message.result ?? '';
  }

  return text;
}

export const askClaude: Ask = async ({ system, prompt, signal }) => {
  const { query } = (await import(/* @vite-ignore */ SDK)) as Sdk;
  const { tmpdir } = (await import(/* @vite-ignore */ OS)) as { tmpdir: () => string };
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  const timer = setTimeout(stop, CALL_MS);

  signal?.addEventListener('abort', stop, { once: true });

  const run = query({
    prompt,
    options: {
      model: INTENT_MODEL(),
      effort: INTENT_EFFORT(),
      systemPrompt: system,
      tools: [],
      permissionMode: 'dontAsk',
      settingSources: [],
      persistSession: false,
      maxTurns: 1,
      cwd: tmpdir(),
      env: cleanEnv(processEnv()),
      abortController,
    },
  });

  try {
    return await drain(run);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    run.close?.();
  }
};

export function jsonIn(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start < 0 || end <= start) throw new Error('Claude answered without a JSON object.');

  return JSON.parse(text.slice(start, end + 1));
}
