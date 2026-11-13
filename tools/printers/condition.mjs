const ATOM = /^(!?)([a-z_]+)(?:\[(\d+)\])?(?:\s*(==|!=|<=|>=|<|>|=~|!~)\s*(\/(?:\\.|[^/])*\/|"[^"]*"|[\w.+-]+))?$/;

function valueOf(machine, key, index) {
  const raw = machine[key];
  const value = Array.isArray(raw) ? raw[Number(index ?? 0)] : raw;

  return value === undefined || value === null ? '' : String(value);
}

const truthy = (value) => value !== '' && value !== '0' && value !== 'false';

function compare(left, op, literal) {
  if (op === '=~' || op === '!~') {
    const matches = new RegExp(`^(?:${literal.slice(1, -1)})$`, 's').test(left);

    return op === '=~' ? matches : !matches;
  }

  const right = literal.replace(/^"|"$/g, '');
  const numeric = left !== '' && Number.isFinite(Number(left)) && Number.isFinite(Number(right));
  const [a, b] = numeric ? [Number(left), Number(right)] : [left, right];
  const results = { '==': a === b, '!=': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b };

  return results[op];
}

function atom(text, machine) {
  const match = text
    .replace(/^\(+|\)+$/g, '')
    .trim()
    .match(ATOM);

  if (!match) return false;

  const [, not, key, index, op, literal] = match;
  const value = valueOf(machine, key, index);
  const result = op ? compare(value, op, literal) : truthy(value);

  return not ? !result : result;
}

export function matchesCondition(condition, machine) {
  const text = String(condition ?? '').trim();

  if (!text) return true;

  return text.split(/\s+or\s+/).some((any) => any.split(/\s+and\s+/).every((all) => atom(all.trim(), machine)));
}
