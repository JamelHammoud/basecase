import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { codexArgs, codexLimit, runCodex } from './codex.mjs';
import { fingerprint } from './sessionJournal.mjs';

vi.mock('./codexHome.mjs', () => ({ codexHome: (env) => env }));

const dirs = [];
const schema = { type: 'object', properties: { changed: { type: 'boolean' } }, required: ['changed'] };
const events = [
  { type: 'thread.started', thread_id: 'task-thread' },
  { type: 'turn.completed', usage: { input_tokens: 50, output_tokens: 10 } },
];

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function options(extra = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-execution-'));

  dirs.push(cwd);

  return {
    cwd,
    brief: 'Build and test the requested change.',
    prompt: 'Build the feature.',
    schema,
    hours: 1,
    ...extra,
  };
}

describe('Codex execution', () => {
  it('refuses scoped tool access instead of substituting a workspace shell sandbox', () => {
    const execute = vi.fn();
    const result = runCodex(options({ sandbox: { tools: ['Read'], allow: ['Read'] } }), execute);

    expect(result).toEqual({ ok: false, error: 'Codex exec cannot enforce scoped tool allowlists' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('repairs only a malformed answer using the same thread and accounts for both turns', () => {
    const calls = [];
    const execute = (_command, args, settings) => {
      calls.push({ args, settings });
      fs.writeFileSync(args[args.indexOf('-o') + 1], calls.length === 1 ? 'broken' : '{"changed":true}');

      const emitted = events.map((event) =>
        event.usage
          ? { ...event, usage: { input_tokens: calls.length * 50, output_tokens: calls.length * 10 } }
          : event,
      );

      return { ok: true, out: emitted.map((event) => JSON.stringify(event)).join('\n'), err: '' };
    };
    const result = runCodex(options(), execute);

    expect(result).toMatchObject({
      ok: true,
      output: { changed: true },
      formatRetried: true,
      usage: { input_tokens: 50 },
      previousUsage: { input_tokens: 50 },
    });
    expect(calls[1].args.slice(0, 3)).toEqual(['exec', 'resume', 'task-thread']);
    expect(calls[1].settings.input).toContain('Do not repeat implementation or checks');
    expect(calls[1].settings.input).not.toContain('Build the feature.');
  });

  it('never treats successful tool output about rate limits as an actual provider rejection', () => {
    const out = JSON.stringify({ type: 'item.completed', item: { text: 'Test passed: usage limit reached' } });

    expect(codexLimit({ out })).toBeNull();
    expect(codexLimit({ out: JSON.stringify({ type: 'error', message: 'usage limit reached' }) })).not.toBeNull();
  });

  it('resumes only the same worktree, instructions and schema, leaving independent review fresh', () => {
    const original = options();
    const continuation = {
      provider: 'codex',
      id: 'task-thread',
      fingerprint: fingerprint({ cwd: original.cwd, brief: original.brief, schema }),
    };
    const files = { schemaFile: 'schema.json', outFile: 'answer.json' };

    expect(codexArgs({ ...original, continuation }, files).slice(0, 3)).toEqual(['exec', 'resume', 'task-thread']);
    expect(codexArgs({ ...original, continuation, brief: 'Independent review.' }, files)[1]).toBe('-C');
    expect(codexArgs({ ...original, continuation, sandbox: { tools: [], allow: [] } }, files)).toContain('--ephemeral');
  });

  it('does not repair or repeat implementation after a failed process', () => {
    let calls = 0;
    const result = runCodex(options(), () => {
      calls++;

      return { ok: false, out: '', err: 'worker crashed' };
    });

    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it('preserves matching recovery context when launching a continuation throws', () => {
    const original = options();
    const continuation = {
      provider: 'codex',
      id: 'task-thread',
      fingerprint: fingerprint({ cwd: original.cwd, brief: original.brief, schema }),
    };
    const execute = () => {
      throw new Error('login sharing is busy');
    };

    expect(runCodex({ ...original, continuation }, execute)).toMatchObject({ ok: false, session: continuation });
    expect(runCodex({ ...original, continuation, brief: 'Different instructions.' }, execute).session).toBeNull();
  });

  it('retains the completed implementation thread if a formatting retry cannot launch', () => {
    let calls = 0;
    const execute = () => {
      calls++;

      if (calls === 2) throw new Error('login sharing is busy');

      return { ok: true, out: events.map((event) => JSON.stringify(event)).join('\n'), err: '' };
    };
    const result = runCodex(options(), execute);

    expect(result).toMatchObject({ ok: false, formatRetried: true, session: { id: 'task-thread' } });
    expect(result.usage).toEqual({ input_tokens: 50, output_tokens: 10 });
  });

  it('never relabels an unmatched continuation as a new session after a failed fresh start', () => {
    const original = options();
    const continuation = {
      provider: 'codex',
      id: 'old-thread',
      fingerprint: fingerprint({ cwd: original.cwd, brief: original.brief, schema }),
    };
    const result = runCodex({ ...original, continuation, brief: 'Independent review.' }, () => ({
      ok: false,
      out: '',
      err: 'could not launch',
    }));

    expect(result).toMatchObject({ ok: false, session: null });
  });

  it('preserves prior cumulative usage when a resumed process fails before completing a turn', () => {
    const original = options();
    const continuation = {
      provider: 'codex',
      id: 'old-thread',
      totalUsage: { input_tokens: 50, output_tokens: 10 },
      fingerprint: fingerprint({ cwd: original.cwd, brief: original.brief, schema }),
    };
    const result = runCodex({ ...original, continuation }, () => ({ ok: false, out: '', err: 'could not launch' }));

    expect(result.session.totalUsage).toEqual(continuation.totalUsage);
    expect(result.usage).toBeUndefined();
  });

  it('keeps prose-only input away from shell tools, web access and repository instructions', () => {
    const args = codexArgs(options({ name: 'voice', sandbox: { tools: [], allow: [] } }), {
      schemaFile: 'schema.json',
      outFile: 'answer.json',
    });

    expect(args).toContain('project_doc_max_bytes=0');
    expect(args).toContain('web_search="disabled"');
    expect(args.join(' ')).toContain('--disable shell_tool --disable unified_exec --disable code_mode_host');
    expect(args).toContain('read-only');
  });
});

describe('Codex delegation', () => {
  it.each(['build', 'refine', 'review', 'voice'])(
    'disables nested delegation for %s starts and continuations',
    (name) => {
      const original = options({ name });
      const continuation = {
        provider: 'codex',
        id: 'thread',
        fingerprint: fingerprint({ cwd: original.cwd, brief: original.brief, schema }),
      };
      const files = { schemaFile: 'schema.json', outFile: 'answer.json' };

      for (const context of [original, { ...original, continuation }]) {
        expect(codexArgs(context, files).join(' ')).toContain('--disable multi_agent --disable multi_agent_v2');
      }
    },
  );
});

describe('Codex limit recovery', () => {
  it('does not repeat a completed task after recovering from a provider limit', () => {
    const out = [
      { type: 'error', message: 'usage limit reached' },
      { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n');

    expect(codexLimit({ out, err: 'Recovered from usage limit reached' })).toBeNull();
    expect(
      codexLimit({ out: `${out}\n${JSON.stringify({ type: 'turn.failed', error: 'usage limit reached' })}` }),
    ).not.toBeNull();
  });
});

it('keeps formatting repair inside the same total execution deadline', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const execute = vi.fn((_command, args, settings) => {
    expect(settings.timeout).toBe(1000);
    fs.writeFileSync(args[args.indexOf('-o') + 1], 'broken');
    clock.mockReturnValue(2001);

    return { ok: true, out: events.map((event) => JSON.stringify(event)).join('\n'), err: '' };
  });

  try {
    expect(runCodex(options({ deadlineAt: 2000 }), execute)).toMatchObject({
      ok: false,
      session: { id: 'task-thread' },
      error: 'Task execution deadline exhausted',
    });
    expect(execute).toHaveBeenCalledOnce();
  } finally {
    clock.mockRestore();
  }
});

it('passes an integer process timeout when the remaining hours lose precision', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const execute = vi.fn((_command, args, settings) => {
    expect(Number.isInteger(settings.timeout)).toBe(true);
    expect(settings.timeout).toBeLessThanOrEqual(1001);
    fs.writeFileSync(args[args.indexOf('-o') + 1], '{"changed":true}');

    return { ok: true, out: events.map((event) => JSON.stringify(event)).join('\n'), err: '' };
  });

  try {
    expect(runCodex(options({ hours: 1001 / 3_600_000, deadlineAt: 2001 }), execute).ok).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  } finally {
    clock.mockRestore();
  }
});
