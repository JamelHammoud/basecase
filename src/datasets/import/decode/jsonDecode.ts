import { Budget, DECODE_LIMITS, damaged, refused } from './limits';
import type { Decoded, DecodedMessage } from './types';

const OPENERS = new Set(['{', '[']);
const CLOSERS = new Set(['}', ']']);

function checkDepth(text: string) {
  let depth = 0;
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      quoted = char !== '"';
      i += char === '\\' ? 1 : 0;

      continue;
    }

    quoted = char === '"';
    depth += (OPENERS.has(char) ? 1 : 0) - (CLOSERS.has(char) ? 1 : 0);

    if (depth > DECODE_LIMITS.depth) throw refused();
  }
}

const isNumberList = (value: unknown[]) => value.every((item) => typeof item === 'number');

function convert(value: unknown, budget: Budget): Decoded {
  if (Array.isArray(value)) {
    budget.spend(value.length);

    return isNumberList(value) ? Float64Array.from(value) : value.map((item) => convert(item, budget));
  }

  if (value === null || typeof value !== 'object') {
    budget.spend(1);

    return value as Decoded;
  }

  return convertObject(value as Record<string, unknown>, budget);
}

function convertObject(value: Record<string, unknown>, budget: Budget): DecodedMessage {
  const entries = Object.entries(value);

  budget.spend(entries.length + 1);

  return Object.fromEntries(entries.map(([key, item]) => [key, convert(item, budget)]));
}

export function decodeJson(bytes: Uint8Array): DecodedMessage {
  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;

  checkDepth(text);

  try {
    parsed = JSON.parse(text);
  } catch {
    throw damaged();
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw damaged();

  return convertObject(parsed as Record<string, unknown>, new Budget());
}
