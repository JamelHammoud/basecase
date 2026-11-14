import { lastAtOrBefore } from '../dataLayers/track';
import { numberLabel } from './states';
import type { RecordedTopic, TopicLog } from './topicLog';

export const TOPIC_SPACE = 'topic';

export interface Timed<T> {
  t: number[];
  v: T[];
}

type Column =
  | { kind: 'number'; topic: RecordedTopic; values: Float64Array }
  | { kind: 'label'; topic: RecordedTopic; values: string[] }
  | { kind: 'item'; topic: RecordedTopic; list: string; item: number };

const ITEM = /^(.*)\[(\d+)\]$/u;
const NO_TIMED: Timed<never> = { t: [], v: [] };

export const topicRef = (topic: string, path?: string) => `${TOPIC_SPACE}.${topic}${path ? `.${path}` : ''}`;

export const isTopicSignal = (id: string) => id.startsWith(`${TOPIC_SPACE}.`);

export const hasWildcard = (pattern: string) => pattern.includes('*') || pattern.includes('[:]');

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function patternRegex(pattern: string) {
  const parts = pattern.split(/(\[:\]|\*)/u).map((part) => {
    if (part === '[:]') return '\\[\\d+\\]';

    return part === '*' ? '[^.]*' : escaped(part);
  });

  return new RegExp(`^${parts.join('')}$`, 'u');
}

const longestList = (topic: RecordedTopic, path: string) => {
  const list = topic.lists.get(path);
  let longest = 0;

  for (let i = 0; list && i + 1 < list.at.length; i++) longest = Math.max(longest, list.at[i + 1] - list.at[i]);

  return longest;
};

export class TopicIndex {
  readonly topics: RecordedTopic[];
  readonly #byName: Map<string, RecordedTopic>;
  readonly #series = new Map<string, Timed<number>>();
  readonly #labels = new Map<string, Timed<string>>();
  readonly #ids = new Map<string, string[]>();

  constructor(log: TopicLog) {
    this.topics = log.topics;
    this.#byName = new Map(log.topics.map((t) => [t.topic, t]));
  }

  topic(ref: string): RecordedTopic | null {
    const resolved = this.resolve(ref);

    return resolved && !resolved.path ? resolved.topic : null;
  }

  resolve(id: string): { topic: RecordedTopic; path: string } | null {
    if (!isTopicSignal(id)) return null;

    const rest = id.slice(TOPIC_SPACE.length + 1);
    let found: RecordedTopic | null = null;

    for (const topic of this.topics) {
      const fits = rest === topic.topic || rest.startsWith(`${topic.topic}.`);

      if (fits && (!found || topic.topic.length > found.topic.length)) found = topic;
    }

    return found && { topic: found, path: rest.slice(found.topic.length + 1) };
  }

  #column(id: string): Column | null {
    const resolved = this.resolve(id);

    if (!resolved?.path) return null;

    const { topic, path } = resolved;
    const numbers = topic.numbers.get(path);

    if (numbers) return { kind: 'number', topic, values: numbers };

    const labels = topic.labels.get(path);

    if (labels) return { kind: 'label', topic, values: labels };

    const item = ITEM.exec(path);

    return item && topic.lists.has(item[1]) ? { kind: 'item', topic, list: item[1], item: Number(item[2]) } : null;
  }

  #itemValue(column: Extract<Column, { kind: 'item' }>, message: number) {
    const list = column.topic.lists.get(column.list)!;
    const at = list.at[message] + column.item;

    return at < list.at[message + 1] ? list.v[at] : Number.NaN;
  }

  series(id: string): Timed<number> {
    const kept = this.#series.get(id);

    if (kept) return kept;

    const column = this.#column(id);

    if (!column || column.kind === 'label') return NO_TIMED;

    const t = Array.from(column.topic.t);
    const v =
      column.kind === 'number' ? Array.from(column.values) : t.map((_, message) => this.#itemValue(column, message));
    const made = { t, v };

    this.#series.set(id, made);

    return made;
  }

  labels(id: string): Timed<string> | null {
    const known = this.#labels.get(id);

    if (known) return known;

    const resolved = this.resolve(id);
    const values = resolved?.topic.labels.get(resolved.path);

    if (!resolved || !values) return null;

    const numbers = resolved.topic.numbers.get(resolved.path);
    const v = numbers ? values.map((value, i) => value || numberLabel(numbers[i])) : values;
    const labels = { t: Array.from(resolved.topic.t), v };

    this.#labels.set(id, labels);

    return labels;
  }

  valueAt(id: string, time: number): number | string[] | undefined {
    const column = this.#column(id);
    const message = column ? lastAtOrBefore(column.topic.t, time) : -1;

    if (!column || message < 0) return undefined;

    if (column.kind === 'label') return [column.values[message]];

    const value = column.kind === 'number' ? column.values[message] : this.#itemValue(column, message);

    if (!Number.isNaN(value)) return value;

    const label = column.topic.labels.get(this.resolve(id)!.path)?.[message];

    return label ? [label] : undefined;
  }

  #topicIds(topic: RecordedTopic): string[] {
    const kept = this.#ids.get(topic.topic);

    if (kept) return kept;

    const items = [...topic.lists.keys()].flatMap((path) =>
      Array.from({ length: longestList(topic, path) }, (_, i) => `${path}[${i}]`),
    );
    const ids = [...new Set([...topic.numbers.keys(), ...topic.labels.keys(), ...items])].map((p) =>
      topicRef(topic.topic, p),
    );

    this.#ids.set(topic.topic, ids);

    return ids;
  }

  expand(pattern: string): string[] {
    if (!hasWildcard(pattern)) return [pattern];

    const regex = patternRegex(pattern);

    return this.topics.flatMap((topic) => this.#topicIds(topic).filter((id) => regex.test(id)));
  }

  listed(): string[] {
    return this.topics.flatMap((topic) => [
      ...[...new Set([...topic.numbers.keys(), ...topic.labels.keys()])].map((p) => topicRef(topic.topic, p)),
      ...[...topic.lists.keys()].map((p) => topicRef(topic.topic, `${p}[:]`)),
    ]);
  }

  has(name: string) {
    return this.#byName.has(name);
  }
}
