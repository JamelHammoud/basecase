import { scadStatementSpans, skipBlank } from './scadStatements.mjs';

const ASSIGNMENT = /([A-Za-z_]\w*)[ \t]*=[ \t]*(?=[-\d.])/y;
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const END = /[ \t]*;/y;
const ANY_ASSIGNMENT = /^([A-Za-z_]\w*)\s*=(?!=)/;
const RANGE = /^[ \t]*;[ \t]*\/\/[ \t]*\[([^\]\n]*)\]/;
const PLAIN = /^-?\d+(?:\.\d+)?$/;
const MAX_MAGNITUDE = 100000;
const DECIMALS = 4;

const sticky = (pattern, text, at) => {
  pattern.lastIndex = at;

  return pattern.exec(text);
};

function customizerRange(comment) {
  const match = RANGE.exec(comment);

  if (!match) return {};

  const bounds = match[1].split(':').map((s) => (s.trim() && PLAIN.test(s.trim()) ? Number(s) : NaN));

  if (bounds.some(Number.isNaN)) return {};

  if (bounds.length === 1) return { min: 0, max: bounds[0] };

  if (bounds.length === 2) return { min: bounds[0], max: bounds[1] };

  return bounds.length === 3 ? { min: bounds[0], step: bounds[1], max: bounds[2] } : {};
}

function numericAssignment(code, { start, end }) {
  const head = skipBlank(code, start);
  const name = sticky(ASSIGNMENT, code, head);
  const literal = name && sticky(NUMBER, code, ASSIGNMENT.lastIndex);
  const close = literal && sticky(END, code, NUMBER.lastIndex);

  if (!close) return null;

  const at = head + name[0].length;
  const value = Number(literal[0]);

  if (!Number.isFinite(value)) return null;

  const range = customizerRange(code.slice(at + literal[0].length, end));

  return { name: name[1], value, start: at, end: at + literal[0].length, ...range };
}

const assignedName = (code, span) => ANY_ASSIGNMENT.exec(code.slice(skipBlank(code, span.start), span.end))?.[1];

export function scadDimensions(code) {
  const spans = scadStatementSpans(code);
  const counts = new Map();

  for (const span of spans) {
    const name = assignedName(code, span);

    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return spans.map((span) => numericAssignment(code, span)).filter((dim) => dim && counts.get(dim.name) === 1);
}

export function clampDimension(dim, value) {
  const low = dim.min ?? -Infinity;
  const high = dim.max ?? Infinity;

  return Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high));
}

export function formatDimension(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_MAGNITUDE) {
    throw new Error('A dimension must be a number.');
  }

  const text = String(Number(value.toFixed(DECIMALS)));

  if (!PLAIN.test(text)) throw new Error('A dimension must be a number.');

  return text;
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

export function rewriteDimensions(code, values) {
  if (typeof code !== 'string' || !isPlainObject(values)) throw new Error('Nothing to change.');

  const dims = new Map(scadDimensions(code).map((dim) => [dim.name, dim]));
  const edits = Object.keys(values).map((name) => {
    const dim = dims.get(name);

    if (!dim) throw new Error('That is not a dimension of this part.');

    formatDimension(values[name]);

    return { ...dim, text: formatDimension(clampDimension(dim, values[name])) };
  });

  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end), code);
}
