import fs from 'node:fs';
import path from 'node:path';
import { BRIEFS } from './paths.mjs';
import { run } from './sh.mjs';

export const brief = (name) =>
  [
    fs.readFileSync(path.join(BRIEFS, 'shared.md'), 'utf8'),
    fs.readFileSync(path.join(BRIEFS, `${name}.md`), 'utf8'),
  ].join('\n\n');

const lastResult = (out) => {
  const events = JSON.parse(out);
  const list = Array.isArray(events) ? events : [events];

  return list.filter((event) => event?.type === 'result').at(-1) ?? null;
};

export function runAgent({ cwd, name, prompt, schema, hours = 6 }) {
  const args = [
    '-p',
    prompt,
    '--append-system-prompt',
    brief(name),
    '--dangerously-skip-permissions',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
    '--no-session-persistence',
  ];
  const { out, err } = run(process.env.CLAUDE_BIN || 'claude', args, {
    cwd,
    timeout: hours * 60 * 60 * 1000,
    allowFail: true,
  });

  try {
    const result = lastResult(out);
    const usable = result && !result.is_error && result.structured_output;

    return usable ? { ok: true, output: result.structured_output } : { ok: false, error: result?.result || err };
  } catch (error) {
    return { ok: false, error: `${error.message}: ${(err || out).slice(-1000)}` };
  }
}

const text = (description) => ({ type: 'string', description });

export const CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    changed: { type: 'boolean', description: 'False when nothing should be merged' },
    kind: { type: 'string', enum: ['feature', 'integration', 'fix', 'repair', 'refine', 'lesson', 'loop', 'update'] },
    title: text('What changed, verb first, sentence case, no period, no kind prefix'),
    summary: text('What a user or contributor gets, in two or three plain sentences'),
    why: text('One or two sentences: the reason, from the arc, the bug or the failure'),
    cause: text('For fix and repair: the root cause and how it was reproduced; else empty'),
    checked: text('How it was checked: tests added, commands run, rates measured'),
    changelog: text('One changelog line if users can see the change, else empty'),
    screenshots: { type: 'array', items: text('Repo path of a committed screenshot on this branch') },
    copy: {
      type: 'array',
      description: 'Every user-facing string this change adds, written as in the code (${…} for interpolations)',
      items: {
        type: 'object',
        properties: { string: text('The string'), why: text('Why the screen needs it') },
        required: ['string', 'why'],
      },
    },
    commitMessage: text('Commit message: a subject line, a blank line, then the why'),
    notes: text('What was learned or left undone, for the loop'),
  },
  required: ['changed', 'kind', 'title', 'summary', 'why', 'cause', 'checked', 'changelog', 'screenshots'],
};
