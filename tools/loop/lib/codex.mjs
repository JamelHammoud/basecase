import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './sh.mjs';

export const CODEX_MODEL = process.env.CODEX_MODEL || 'gpt-6.1-sol';
export const CODEX_EFFORT = process.env.CODEX_EFFORT || 'high';

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

export const codexLimit = ({ out = '', err = '' }, now = Date.now()) =>
  LIMIT_TEXT.test(`${out.slice(-4000)}\n${err.slice(-4000)}`) ? { until: now + UNKNOWN_RESET_MS } : null;

const accessArgs = (sandbox) => {
  if (!sandbox) return ['--dangerously-bypass-approvals-and-sandbox'];

  const writes = sandbox.tools.some((tool) => WRITES.has(tool));

  return ['--sandbox', writes ? 'workspace-write' : 'read-only', '-c', 'approval_policy="never"'];
};

export function runCodex({ cwd, brief, prompt, schema, hours, sandbox, env }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-codex-'));
  const schemaFile = path.join(dir, 'schema.json');
  const outFile = path.join(dir, 'answer.json');

  fs.writeFileSync(schemaFile, JSON.stringify(strictSchema(schema)));

  try {
    const args = [
      '--search',
      'exec',
      '--model',
      CODEX_MODEL,
      '-c',
      `model_reasoning_effort="${CODEX_EFFORT}"`,
      ...accessArgs(sandbox),
      '--ephemeral',
      '--skip-git-repo-check',
      '--output-schema',
      schemaFile,
      '-o',
      outFile,
      '-C',
      cwd,
      '-',
    ];
    const result = run(process.env.CODEX_BIN || 'codex', args, {
      cwd,
      env,
      input: `${brief}\n\n---\n\n${prompt}`,
      timeout: hours * 60 * 60 * 1000,
      allowFail: true,
    });
    const limited = codexLimit(result);

    if (limited) return { ok: false, limited, error: result.err.slice(-1000) };

    const answer = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';

    return { ok: true, output: fromStrict(JSON.parse(answer), schema) };
  } catch (error) {
    return { ok: false, error: `Codex gave no usable answer: ${error.message}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
