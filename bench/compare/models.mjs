const canonical = (id) =>
  String(id ?? '')
    .toLowerCase()
    .replace(/\[[^\]]*\]$/, '')
    .replace(/\./g, '-')
    .trim();

const isConcreteId = (arg) => /^claude-/i.test(arg);

function familyMatch(arg, available) {
  const words = canonical(arg).split(/[^a-z0-9]+/);

  return available.filter((m) => m.id !== 'default' && words.includes(canonical(m.id)));
}

export function resolveModel(arg, available) {
  const wanted = canonical(arg);
  const exact = available.find((m) => canonical(m.id) === wanted || canonical(m.name) === wanted);

  if (exact) return { arg, id: exact.id, name: exact.name, expectServed: isConcreteId(arg) ? wanted : null };

  const family = familyMatch(arg, available);

  if (family.length === 1)
    return { arg, id: family[0].id, name: family[0].name, expectServed: isConcreteId(arg) ? wanted : null };

  const choices = available.map((m) => m.id).join(', ') || 'none reported';

  throw new Error(`The agent has no model “${arg}”. It offers: ${choices}.`);
}

const tokensOf = (row) => row?.token_count ?? {};

export function servedModels(modelUsage) {
  if (!Array.isArray(modelUsage)) return [];

  return modelUsage
    .map((row) => ({
      model: row.model,
      outputTokens: Number(tokensOf(row).outputTokens) || 0,
      totalTokens: Number(tokensOf(row).totalTokens) || 0,
    }))
    .filter((r) => r.model)
    .sort((a, b) => b.outputTokens - a.outputTokens);
}

export const mainServedModel = (modelUsage) => servedModels(modelUsage)[0]?.model ?? null;

export function servedMismatch(resolved, served) {
  if (!resolved.expectServed || !served) return null;

  if (canonical(served) === resolved.expectServed) return null;

  return `Asked for ${resolved.arg} but ${served} answered.`;
}

export function sharedEffort(models, wanted) {
  const levelsOf = (m) => (m.effortLevels ?? []).map((l) => l.id);
  const shared = models.map(levelsOf).reduce((acc, ids) => acc.filter((id) => ids.includes(id)));

  if (wanted && !shared.includes(wanted))
    throw new Error(`Effort “${wanted}” isn't offered by every model. Shared levels: ${shared.join(', ') || 'none'}.`);

  if (wanted) return wanted;

  if (shared.includes('high')) return 'high';

  return shared[shared.length - 1] ?? null;
}
