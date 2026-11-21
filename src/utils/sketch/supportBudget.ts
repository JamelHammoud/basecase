export const SUPPORT_INPUT_BYTES = 2 * 1024 * 1024;
export const SUPPORT_SOURCE_BYTES = 512 * 1024;

interface Frame {
  value: unknown;
  depth: number;
  exit?: boolean;
}

interface Budget {
  pending: Frame[];
  active: Set<object>;
  bytes: number;
  limit: number;
}

function visitObject(item: object, frame: Frame, budget: Budget): boolean {
  if (frame.exit) {
    budget.active.delete(item);

    return true;
  }

  if (budget.active.has(item)) return false;

  if (Array.isArray(item) && item.length * 8 > budget.limit - budget.bytes) return false;

  if (Array.isArray(item) && item.every((n) => typeof n === 'number')) {
    budget.bytes += item.length * 8;

    return true;
  }

  const keys = Object.keys(item);

  if (keys.length > 2048) return false;

  budget.active.add(item);
  budget.pending.push({ ...frame, exit: true });
  budget.bytes += keys.reduce((sum, key) => sum + key.length * 2 + 8, 0);

  for (const key of keys)
    budget.pending.push({ value: (item as Record<string, unknown>)[key], depth: frame.depth + 1 });

  return true;
}

export function withinSupportBudget(value: unknown, limit = SUPPORT_INPUT_BYTES): boolean {
  const budget: Budget = { pending: [{ value, depth: 0 }], active: new Set(), bytes: 0, limit };

  while (budget.pending.length) {
    const frame = budget.pending.pop()!;
    const item = frame.value;

    if (frame.depth > 24 || budget.bytes > limit) return false;

    const isObject = item && typeof item === 'object';

    if (isObject && !visitObject(item, frame, budget)) return false;

    if (isObject) continue;

    budget.bytes += typeof item === 'string' ? item.length * 2 : 8;
  }

  return budget.bytes <= limit;
}
