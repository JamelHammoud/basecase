import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';
import { run } from './sh.mjs';

const FILE = path.join(LOOP_DIR, 'state', 'usage-pause.json');
const CODEX_FILE = path.join(LOOP_DIR, 'state', 'codex-pause.json');
const UNKNOWN_RESET_MS = 30 * 60 * 1000;
const PROBE_EVERY_MS = 15 * 60 * 1000;
const LIMIT_TEXT =
  /usage limit reached|hit your (?:5-hour |weekly )?limit|(?:5-hour|weekly) limit reached|reached your (?:weekly )?usage limit/i;

export class UsageLimit extends Error {
  constructor(until) {
    super(`usage limit reached; paused until ${new Date(until).toISOString()}`);
    this.until = until;
  }
}

const rejectedResets = (value, found = []) => {
  if (!value || typeof value !== 'object') return found;

  if (value.status === 'rejected' && typeof value.resetsAt === 'number') found.push(value.resetsAt * 1000);

  for (const child of Object.values(value)) rejectedResets(child, found);

  return found;
};

const parsed = (out) => {
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
};

const eventsIn = (value) => {
  if (Array.isArray(value)) return value;

  return value ? [value] : [];
};

export function limitIn({ out = '', err = '' }, now = Date.now()) {
  const json = parsed(out);
  const events = eventsIn(json);
  const result = events.findLast((event) => event?.type === 'result');

  if (result && !result.is_error) return null;

  const judged = [...events.filter((event) => event?.type === 'rate_limit_event'), ...(result ? [result] : [])];
  const resets = judged.flatMap((event) => rejectedResets(event)).filter((at) => at > now);

  if (resets.length > 0) return { until: Math.max(...resets) };

  const said = typeof result?.result === 'string' ? result.result : '';
  const text = `${json ? said : out}\n${err}`;

  return LIMIT_TEXT.test(text) ? { until: now + UNKNOWN_RESET_MS } : null;
}

const readFrom = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const writeTo = (file, state) => {
  const tmp = `${file}.${process.pid}`;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
};

const read = () => readFrom(FILE);

const write = (state) => writeTo(FILE, state);

const startIn = (file, until, now) => {
  const current = readFrom(file);

  writeTo(file, {
    since: current?.since ?? now,
    until: Math.max(until, current?.until ?? 0),
    probedAt: current?.probedAt ?? now,
    announced: current?.announced ?? false,
  });

  return !current;
};

export const pause = () => read();

export const startPause = (until, now = Date.now()) => startIn(FILE, until, now);

export const resume = () => fs.rmSync(FILE, { force: true });

export const markAnnounced = () => {
  const current = read();

  if (current) write({ ...current, announced: true });
};

export const codexPause = () => readFrom(CODEX_FILE);

export const startCodexPause = (until, now = Date.now()) => startIn(CODEX_FILE, until, now);

export const resumeCodex = () => fs.rmSync(CODEX_FILE, { force: true });

export const isActive = (state, now = Date.now()) => Boolean(state) && now < state.until;

export function probeDue(now = Date.now()) {
  const current = read();

  if (!current || now - current.probedAt < PROBE_EVERY_MS) return false;

  write({ ...current, probedAt: now });

  return true;
}

export function probe() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-probe-'));

  try {
    const args = ['-p', 'Reply with the word ok.', '--output-format', 'json', '--no-session-persistence'];
    const result = run(process.env.CLAUDE_BIN || 'claude', args, { cwd, timeout: 5 * 60 * 1000, allowFail: true });

    return limitIn(result) ?? (result.ok ? null : { until: Date.now() + PROBE_EVERY_MS });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
