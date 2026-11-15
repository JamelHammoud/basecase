import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './sh.mjs';
import { continuationMatches, fingerprint, jsonLines } from './sessionJournal.mjs';
import { codexHome } from './codexHome.mjs';

export const CODEX_MODEL = process.env.CODEX_MODEL || 'gpt-6.1-sol';
export const CODEX_EFFORT = process.env.CODEX_EFFORT || 'medium';

const UNKNOWN_RESET_MS = 30 * 60 * 1000;
const LIMIT_TEXT = /usage limit|hit your (?:usage |weekly |5-hour )?limit|rate limit reached|quota exceeded/i;
const UNSUPPORTED = ['maxLength', 'minLength', 'pattern', 'minItems', 'maxItems', 'format'];
const WRITES = new Set(['Edit', 'Write']);

const typesWithNull = (type) => [...new Set([...(Array.isArray(type) ? type : [type]), 'null'])];

export function strictSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const copy = Object.fromEntries(Object.entries(schema).filter(([key]) => !UNSUPPORTED.includes(key)));

  if (copy.items) copy.items = strictSchema(copy.items);

  if (!copy.properties) return copy;

  const required = new Set(schema.required ?? []);
  const properties = Object.fromEntries(
    Object.entries(copy.properties).map(([key, value]) => {
      const strict = strictSchema(value);

      return [key, required.has(key) || !strict.type ? strict : { ...strict, type: typesWithNull(strict.type) }];
    }),
  );

  return { ...copy, properties, required: Object.keys(properties), additionalProperties: false };
}

export function fromStrict(value, schema) {
  if (Array.isArray(value)) return value.map((item) => fromStrict(item, schema?.items));

  if (!value || typeof value !== 'object' || !schema?.properties) return value;

  const required = new Set(schema.required ?? []);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => item !== null || required.has(key))
      .map(([key, item]) => [key, fromStrict(item, schema.properties[key])]),
  );
}

export function codexLimit({ out = '', err = '' }, now = Date.now()) {
  const events = jsonLines(out);
  const errors = events.filter((event) => event.type === 'error' || event.type === 'turn.failed');
  const message = events.length ? errors.map((event) => JSON.stringify(event)).join('\n') : out;

  return LIMIT_TEXT.test(`${message.slice(-4000)}\n${err.slice(-4000)}`) ? { until: now + UNKNOWN_RESET_MS } : null;
}

const accessArgs = (sandbox) => {
  if (!sandbox) return ['--dangerously-bypass-approvals-and-sandbox'];

  const writes = sandbox.tools.some((tool) => WRITES.has(tool));

  return ['--sandbox', writes ? 'workspace-write' : 'read-only', '-c', 'approval_policy="never"'];
};

export function codexArgs(options, files) {
  const { cwd, sandbox, policy, continuation } = options;
  const resumed = continuationMatches(continuation, options);
  const start = resumed ? ['exec', 'resume', continuation.id] : ['exec', '-C', cwd];

  return [
    ...start,
    '--model',
    policy?.model || CODEX_MODEL,
    '-c',
    `model_reasoning_effort="${policy?.effort || CODEX_EFFORT}"`,
    '-c',
    'service_tier="default"',
    ...(options.name === 'voice'
      ? [
          '-c',
          'project_doc_max_bytes=0',
          '-c',
          'web_search="disabled"',
          '--disable',
          'shell_tool',
          '--disable',
          'unified_exec',
          '--disable',
          'code_mode_host',
        ]
      : []),
    '--disable',
    'apps',
    '--disable',
    'plugins',
    ...(sandbox ? accessArgs(sandbox) : ['--dangerously-bypass-approvals-and-sandbox']),
    ...(sandbox ? ['--ephemeral'] : []),
    '--skip-git-repo-check',
    '--json',
    '--output-schema',
    files.schemaFile,
    '-o',
    files.outFile,
    '-',
  ];
}

export function codexSession(out, options) {
  const events = jsonLines(out);
  const started = events.find((event) => event.type === 'thread.started');
  const resumed = continuationMatches(options.continuation, options);
  const id = started?.thread_id ?? (resumed ? options.continuation.id : null);
  const reportedUsage = events.findLast((event) => event.type === 'turn.completed')?.usage;
  const previous = resumed ? (options.continuation.totalUsage ?? {}) : {};
  const totalUsage = reportedUsage ?? (resumed ? options.continuation.totalUsage : undefined);
  const usage =
    reportedUsage &&
    Object.fromEntries(
      Object.entries(reportedUsage).map(([key, value]) => [key, Math.max(0, value - (previous[key] ?? 0))]),
    );
  const session =
    id && !options.sandbox
      ? {
          id,
          provider: 'codex',
          totalUsage,
          fingerprint: fingerprint({ cwd: options.cwd, brief: options.brief, schema: options.schema }),
        }
      : null;

  return { session, usage };
}

function executeCodex(options, files, execute) {
  const resumed = continuationMatches(options.continuation, options);
  const response = execute(process.env.CODEX_BIN || 'codex', codexArgs(options, files), {
    cwd: options.cwd,
    env: codexHome(options.env),
    input: resumed ? options.prompt : `${options.brief}\n\n---\n\n${options.prompt}`,
    timeout: options.hours * 60 * 60 * 1000,
    allowFail: true,
  });
  const metadata = codexSession(response.out, options);
  const limited = codexLimit(response);

  if (limited) return { ok: false, limited, ...metadata };

  if (!response.ok) return { ok: false, error: response.err.slice(-1000), ...metadata };

  try {
    const answer = fs.readFileSync(files.outFile, 'utf8');

    return { ok: true, output: fromStrict(JSON.parse(answer), options.schema), ...metadata };
  } catch (error) {
    return { ok: false, formatError: true, error: `Codex gave no usable answer: ${error.message}`, ...metadata };
  }
}

export function runCodex(options, execute = run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-codex-'));
  const schemaFile = path.join(dir, 'schema.json');
  const outFile = path.join(dir, 'answer.json');
  let result = { session: continuationMatches(options.continuation, options) ? options.continuation : null };
  let formatRetried = false;

  fs.writeFileSync(schemaFile, JSON.stringify(strictSchema(options.schema)));

  try {
    result = executeCodex(options, { schemaFile, outFile }, execute);

    if (!result.formatError || !result.session) return result;

    fs.rmSync(outFile, { force: true });
    formatRetried = true;

    const repaired = executeCodex(
      {
        ...options,
        continuation: result.session,
        prompt:
          'Return your completed task answer again using the required JSON schema. Preserve the work already done. Do not repeat implementation or checks.',
      },
      { schemaFile, outFile },
      execute,
    );

    return { ...repaired, formatRetried: true, previousUsage: result.usage };
  } catch (error) {
    return { ...result, ok: false, formatRetried, error: `Codex gave no usable answer: ${error.message}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
