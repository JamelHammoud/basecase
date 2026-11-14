import { markPresent, sortedPresence } from './presence';
import { flattenMessage, type Leaf } from './flatten';
import {
  TOPIC_LIMITS,
  type Decoded,
  type Ragged,
  type RaggedBytes,
  type RecordedTopic,
  type TopicLog,
} from './topicLog';

const NS_PER_SECOND = 1e9;
const EMPTY_LIST = new Float64Array(0);
const EMPTY_BLOB = new Uint8Array(0);

interface Budget {
  messages: number;
  cells: number;
  listValues: number;
  blobBytes: number;
  labelChars: number;
}

class TopicBuilder {
  readonly ns: bigint[] = [];
  readonly presence = new Map<string, number[]>();
  readonly numbers = new Map<string, number[]>();
  readonly labels = new Map<string, string[]>();
  readonly lists = new Map<string, Array<Float64Array | null>>();
  readonly blobs = new Map<string, Array<Uint8Array | null>>();
  clipped = false;
  needsPresence = false;
  blobBytes = 0;

  readonly topic: string;
  readonly schema: string;

  constructor(topic: string, schema: string) {
    this.topic = topic;
    this.schema = schema;
  }

  get columns() {
    return this.numbers.size + this.labels.size + this.lists.size + this.blobs.size;
  }

  column<T>(columns: Map<string, T[]>, path: string, gap: T): T[] | null {
    const found = columns.get(path);

    if (found) return found;

    if (this.columns >= TOPIC_LIMITS.columns) {
      this.clipped = true;

      return null;
    }

    const made = new Array<T>(this.ns.length - 1).fill(gap);

    columns.set(path, made);

    return made;
  }

  closeRow() {
    const length = this.ns.length;
    const pad = <T>(columns: Map<string, T[]>, gap: T) =>
      columns.forEach((values) => {
        if (values.length < length) values.push(gap);
      });

    pad(this.numbers, Number.NaN);
    pad(this.labels, '');
    pad<Float64Array | null>(this.lists, null);
    pad<Uint8Array | null>(this.blobs, null);
  }
}

function permuted<T>(values: T[], order: number[]): T[] {
  return order.map((i) => values[i]);
}

function raggedList(values: Array<Float64Array | null>): Ragged {
  const at = new Uint32Array(values.length + 1);

  values.forEach((v, i) => {
    at[i + 1] = at[i] + (v?.length ?? 0);
  });

  const v = new Float64Array(at[values.length]);

  values.forEach((list, i) => v.set(list ?? EMPTY_LIST, at[i]));

  return { at, v };
}

function raggedBlob(values: Array<Uint8Array | null>): RaggedBytes {
  const at = new Uint32Array(values.length + 1);

  values.forEach((v, i) => {
    at[i + 1] = at[i] + (v?.length ?? 0);
  });

  const bytes = new Uint8Array(at[values.length]);

  values.forEach((blob, i) => bytes.set(blob ?? EMPTY_BLOB, at[i]));

  return { at, bytes };
}

function mapValues<T, U>(columns: Map<string, T>, make: (value: T) => U): Map<string, U> {
  return new Map([...columns].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, value]) => [path, make(value)]));
}

function finished(builder: TopicBuilder, startNs: bigint): RecordedTopic {
  const order = builder.ns.map((_, i) => i).sort((a, b) => Number(builder.ns[a] - builder.ns[b]) || a - b);
  const presence = sortedPresence(builder.presence, order, builder.needsPresence);

  return {
    topic: builder.topic,
    schema: builder.schema,
    t: Float64Array.from(order, (i) => Number(builder.ns[i] - startNs) / NS_PER_SECOND),
    numbers: mapValues(builder.numbers, (v) =>
      Float64Array.from(permuted(v, order), (x) => (Number.isFinite(x) ? x : NaN)),
    ),
    labels: mapValues(builder.labels, (v) => permuted(v, order)),
    lists: mapValues(builder.lists, (v) => raggedList(permuted(v, order))),
    blobs: mapValues(builder.blobs, (v) => raggedBlob(permuted(v, order))),
    clipped: builder.clipped,
    ...(presence ? { presence } : {}),
  };
}

export class TopicCollector {
  readonly #topics = new Map<string, TopicBuilder>();
  readonly #budget: Budget = { messages: 0, cells: 0, listValues: 0, blobBytes: 0, labelChars: 0 };
  #first: bigint | null = null;
  #last: bigint | null = null;

  get first() {
    return this.#first;
  }

  get last() {
    return this.#last;
  }

  get size() {
    return this.#topics.size;
  }

  #builder(topic: string, schema: string): TopicBuilder | null {
    const found = this.#topics.get(topic);

    if (found) return found;

    if (this.#topics.size >= TOPIC_LIMITS.topics) return null;

    const made = new TopicBuilder(topic, schema);

    this.#topics.set(topic, made);

    return made;
  }

  #noteTime(ns: bigint) {
    this.#first = this.#first === null || ns < this.#first ? ns : this.#first;
    this.#last = this.#last === null || ns > this.#last ? ns : this.#last;
  }

  #fits(builder: TopicBuilder, leaf: Leaf) {
    const budget = this.#budget;

    if (leaf.kind === 'list') return (budget.listValues += leaf.value.length) <= TOPIC_LIMITS.listValues;

    if (leaf.kind === 'label') return (budget.labelChars += leaf.value.length) <= TOPIC_LIMITS.labelChars;

    if (leaf.kind !== 'blob') return true;

    builder.blobBytes += leaf.value.length;
    budget.blobBytes += leaf.value.length;

    return builder.blobBytes <= TOPIC_LIMITS.topicBlobBytes && budget.blobBytes <= TOPIC_LIMITS.blobBytes;
  }

  #hasColumn(builder: TopicBuilder, path: string, leaf: Leaf) {
    return {
      number: builder.numbers,
      label: builder.labels,
      list: builder.lists,
      blob: builder.blobs,
    }[leaf.kind].has(path);
  }

  #take(builder: TopicBuilder, path: string, leaf: Leaf) {
    if (!this.#fits(builder, leaf)) {
      builder.clipped = true;

      return;
    }

    const known = this.#hasColumn(builder, path, leaf);
    const backfill = known ? 0 : builder.ns.length - 1;
    const rowCells = builder.columns + (known ? 0 : 1);

    if (this.#budget.cells + backfill + rowCells > TOPIC_LIMITS.cells) {
      builder.clipped = true;

      return;
    }

    const columns = {
      number: () => builder.column(builder.numbers, path, Number.NaN),
      label: () => builder.column(builder.labels, path, ''),
      list: () => builder.column<Float64Array | null>(builder.lists, path, null),
      blob: () => builder.column<Uint8Array | null>(builder.blobs, path, null),
    }[leaf.kind] as () => unknown[] | null;
    const column = columns();

    if (column && column.length < builder.ns.length) {
      this.#budget.cells += backfill;
      column.push(leaf.value);
      markPresent(builder.presence, `${leaf.kind}:${path}`, builder.ns.length - 1);
      builder.needsPresence ||= leaf.kind === 'label' && leaf.value === '' && path.includes('[');
    }
  }

  add(topic: string, schema: string, ns: bigint, message: Decoded) {
    const builder = this.#builder(topic, schema);

    if (!builder) return;

    if (this.#budget.messages >= TOPIC_LIMITS.messages || this.#budget.cells + builder.columns > TOPIC_LIMITS.cells) {
      builder.clipped = true;

      return;
    }

    this.#budget.messages++;
    this.#noteTime(ns);
    builder.ns.push(ns);

    if (flattenMessage(message, (path, leaf) => this.#take(builder, path, leaf))) builder.clipped = true;

    builder.closeRow();
    this.#budget.cells += builder.columns;
  }

  finish(startNs: bigint): TopicLog {
    const topics = [...this.#topics.values()].sort((a, b) => (a.topic < b.topic ? -1 : 1));

    return { topics: topics.map((b) => finished(b, startNs)) };
  }
}
