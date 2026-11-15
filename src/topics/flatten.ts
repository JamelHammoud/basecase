import { ROOT_PATH, TOPIC_LIMITS, type Decoded, type DecodedMessage } from './topicLog';

export type Leaf =
  | { kind: 'number'; value: number }
  | { kind: 'label'; value: string }
  | { kind: 'list'; value: Float64Array }
  | { kind: 'blob'; value: Uint8Array };

export type LeafVisit = (path: string, leaf: Leaf) => void;

const MAX_DEPTH = 32;

const isMessage = (value: Decoded): value is DecodedMessage =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);

const numberList = (values: Decoded[]) =>
  values.length > 0 && values.every((v) => typeof v === 'number') ? Float64Array.from(values as number[]) : null;

const join = (prefix: string, key: string) => (prefix ? `${prefix}.${key}` : key);

class Walk {
  clipped = false;
  private readonly visit: LeafVisit;

  constructor(visit: LeafVisit) {
    this.visit = visit;
  }

  value(path: string, value: Decoded, depth: number) {
    if (value === null || value === undefined) return;

    if (path.length > TOPIC_LIMITS.pathChars || depth > MAX_DEPTH) {
      this.clipped = true;

      return;
    }

    if (typeof value === 'number') this.visit(path, { kind: 'number', value });
    else if (typeof value === 'boolean') this.visit(path, { kind: 'number', value: value ? 1 : 0 });
    else if (typeof value === 'bigint') this.visit(path, { kind: 'label', value: String(value) });
    else if (typeof value === 'string') this.visit(path, { kind: 'label', value });
    else if (value instanceof Float64Array) this.visit(path, { kind: 'list', value });
    else if (value instanceof Uint8Array) this.visit(path, { kind: 'blob', value });
    else if (Array.isArray(value)) this.items(path, value, depth);
    else this.message(path, value, depth);
  }

  message(prefix: string, message: DecodedMessage, depth: number) {
    for (const [key, field] of Object.entries(message)) this.value(join(prefix, key), field, depth + 1);
  }

  items(path: string, values: Decoded[], depth: number) {
    const numbers = numberList(values);

    if (numbers) {
      this.visit(path, { kind: 'list', value: numbers });

      return;
    }

    if (values.length > TOPIC_LIMITS.items) this.clipped = true;

    values.slice(0, TOPIC_LIMITS.items).forEach((item, i) => this.value(`${path}[${i}]`, item, depth + 1));
  }
}

export function flattenMessage(message: Decoded, visit: LeafVisit): boolean {
  const walk = new Walk(visit);

  if (isMessage(message)) walk.message('', message, 0);
  else walk.value(ROOT_PATH, message, 0);

  return walk.clipped;
}
