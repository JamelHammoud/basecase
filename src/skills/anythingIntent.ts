import { contractSignals } from './contract';
import { describeBody, type BodyFacts } from './anythingBody';
import { jsonIn, type Ask } from './anythingClaude';
import { INTENT_SYSTEM, intentPrompt, revisionPrompt } from './anythingPrompt';
import { lowerSpec } from './anythingSignals';
import type { IntentKey, IntentVerdict, SpecFormula, TaskSpec } from './anythingTypes';

const MAX_SECONDS = 60;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function keysOf(raw: unknown): IntentKey[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((k): k is IntentKey => !!k && typeof k === 'object' && finite((k as IntentKey).t))
    .sort((a, b) => a.t - b.t);
}

function specOf(raw: Record<string, unknown>): TaskSpec {
  const seconds = Number(raw.seconds);

  if (!finite(seconds) || seconds < 0.5 || seconds > MAX_SECONDS) throw new Error(`seconds must be 0.5 to 60.`);

  if (!raw.success || typeof raw.success !== 'object') throw new Error('The answer has no success formula.');

  const failures = Array.isArray(raw.failures) ? raw.failures : [];

  return {
    kind: 'task',
    name: String(raw.name ?? 'Skill').slice(0, 60) || 'Skill',
    seconds,
    startOffsetDeg: finite(raw.startOffsetDeg) ? Math.max(0, Math.min(60, raw.startOffsetDeg)) : 0,
    restIsGoal: raw.restIsGoal === true,
    success: raw.success as SpecFormula,
    failures: failures.map((f: { label?: unknown; formula?: unknown }, i: number) => ({
      label: String(f?.label ?? `failure ${i + 1}`),
      formula: f?.formula as SpecFormula,
    })),
    intent: keysOf(raw.intent),
  };
}

export function parseVerdict(raw: unknown): IntentVerdict {
  const value = raw as Record<string, unknown>;
  const kind = value?.kind;

  if (kind === 'deformable' || kind === 'impossible') return { kind, reason: String(value.reason ?? '') };

  if (kind !== 'task') throw new Error('kind must be task, deformable or impossible.');

  return specOf(value);
}

export async function specProblems(spec: TaskSpec, facts: BodyFacts): Promise<string[]> {
  try {
    const lowered = lowerSpec(spec, facts);

    await contractSignals(lowered.contract);

    return spec.intent.length ? [] : ['The intent has no keyframes.'];
  } catch (error) {
    return [`The contract can't be used: ${(error as Error).message}`];
  }
}

export interface IntentSession {
  ask: Ask;
  request: string;
  facts: BodyFacts;
  signal?: AbortSignal;
}

const ATTEMPTS = 3;

const CALLS = 3;
const BACKOFF_MS = 5000;

async function askAgain(session: IntentSession, prompt: string): Promise<string> {
  let last: unknown = null;

  for (let call = 0; call < CALLS && !session.signal?.aborted; call++) {
    try {
      return await session.ask({ system: INTENT_SYSTEM, prompt, signal: session.signal });
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * (call + 1)));
    }
  }

  throw last instanceof Error ? last : new Error('Claude could not be reached.');
}

async function askVerdict(session: IntentSession, prompt: string): Promise<{ verdict: IntentVerdict; text: string }> {
  let note = '';

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const text = await askAgain(session, `${prompt}${note}`);

    try {
      const verdict = parseVerdict(jsonIn(text));
      const problems = verdict.kind === 'task' ? await specProblems(verdict, session.facts) : [];

      if (!problems.length) return { verdict, text: JSON.stringify(verdict) };

      note = `\n\nYour previous answer had problems: ${problems.join(' ')} Fix them.`;
    } catch (error) {
      note = `\n\nYour previous answer could not be read: ${(error as Error).message} Answer with the JSON object only.`;
    }
  }

  throw new Error('Claude gave no usable contract.');
}

export function compileIntent(session: IntentSession) {
  return askVerdict(session, intentPrompt({ request: session.request, body: describeBody(session.facts) }));
}

export function reviseIntent(session: IntentSession, options: { previous: TaskSpec; feedback: string }) {
  const prompt = revisionPrompt({
    request: session.request,
    body: describeBody(session.facts),
    previous: JSON.stringify(options.previous),
    feedback: options.feedback,
  });

  return askVerdict(session, prompt);
}
