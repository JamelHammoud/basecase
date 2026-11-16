import { primaryAllowed } from './agent.mjs';
import { policyFor } from './agentPolicy.mjs';
import { reserveOverflow, quotaSnapshot } from './quota.mjs';
import { recordSession } from './sessionJournal.mjs';
import { isActive, pause, UsageLimit } from './usage.mjs';

const refused = () => Object.assign(new UsageLimit(Date.now() + 15 * 60_000), { code: 'allowance' });

export function benchmarkSelection() {
  const policy = policyFor('harness');

  if (!/^(gpt-|o\d)/i.test(policy.model)) throw new Error('Nightly comparisons require a concrete Codex model id.');

  if (policy.provider === 'codex' && primaryAllowed())
    return { provider: 'codex', model: policy.model, effort: policy.effort };

  const model = process.env.BASECASE_LOOP_CLAUDE_MODEL || 'claude-opus-5-5';

  if (!/^claude-/i.test(model)) throw new Error('Nightly comparisons require a concrete Claude model id.');

  const release = benchmarkAdmission('claude');

  release();

  return { provider: 'claude', model, effort: policy.claudeEffort };
}

export function benchmarkAdmission(provider) {
  if (provider === 'codex' && !primaryAllowed()) throw refused();

  if (provider === 'codex') return () => {};

  if (provider !== 'claude' || isActive(pause())) throw refused();

  const release = reserveOverflow();

  if (!release) throw refused();

  return release;
}

const journalUsage = (usage) => ({
  input_tokens: usage?.inputTokens ?? 0,
  output_tokens: usage?.outputTokens ?? 0,
  cache_read_input_tokens: usage?.cachedReadTokens ?? 0,
  cache_creation_input_tokens: usage?.cachedWriteTokens ?? 0,
});

const finished = (pending) => ({
  ...pending,
  state: 'completed',
  finishedAt: Date.now(),
  durationMs: Date.now() - pending.startedAt,
});

export async function benchmarkTurn(selection, execute) {
  const release = benchmarkAdmission(selection.provider);
  const pending = {
    ...selection,
    name: 'harness-benchmark',
    lane: 'harness',
    task: selection.task,
    state: 'running',
    startedAt: Date.now(),
    pid: process.pid,
    quotaBefore: quotaSnapshot(selection.provider),
  };
  const id = recordSession(pending);

  try {
    if (Date.now() >= selection.deadline)
      throw Object.assign(new Error('Comparison deadline reached during allowance admission.'), { code: 'deadline' });

    const result = await execute();

    recordSession({
      ...finished(pending),
      id,
      ok: true,
      usage: journalUsage(result?.result?.usage),
      quotaAfter: quotaSnapshot(selection.provider),
    });

    return result;
  } catch (error) {
    recordSession({ ...finished(pending), id, ok: false, error: error.message });

    throw error;
  } finally {
    release();
  }
}
