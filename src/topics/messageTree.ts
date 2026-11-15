import { fileSize } from '../../electron/fileSize.mjs';
import { fieldPresent } from './presence';
import { numberLabel } from './states';
import type { Decoded, DecodedMessage, RecordedTopic } from './topicLog';

export interface TreeNode {
  key: string;
  value?: string;
  children?: TreeNode[];
}

type Slot = DecodedMessage | Decoded[];

type Path = Array<string | number>;

const SEGMENT = /([^.[\]]+)|\[(\d+)\]/gu;
const paths = new WeakMap<RecordedTopic, Map<string, Path>>();

function tokens(topic: RecordedTopic, path: string): Path {
  let kept = paths.get(topic);

  if (!kept) {
    kept = new Map();
    paths.set(topic, kept);
  }

  const found = kept.get(path);

  if (found) return found;

  const made = [...path.matchAll(SEGMENT)].map((m) => (m[1] === undefined ? Number(m[2]) : m[1]));

  kept.set(path, made);

  return made;
}

function child(slot: Slot, key: string | number, next: string | number): Slot {
  const held = Object.hasOwn(slot, key) ? (slot as Record<string | number, Decoded>)[key] : undefined;

  if (held && typeof held === 'object' && !ArrayBuffer.isView(held)) return held as Slot;

  const made: Slot = typeof next === 'number' ? [] : {};

  Object.defineProperty(slot, key, { value: made, enumerable: true, configurable: true, writable: true });

  return made;
}

function place(root: DecodedMessage, keys: Path, value: Decoded) {
  let slot: Slot = root;

  for (let i = 0; i < keys.length - 1; i++) slot = child(slot, keys[i], keys[i + 1]);

  Object.defineProperty(slot, keys[keys.length - 1], { value, enumerable: true, configurable: true, writable: true });
}

const isItem = (path: string) => path.includes('[');

export function messageAt(topic: RecordedTopic, message: number): DecodedMessage {
  const root: DecodedMessage = {};

  topic.numbers.forEach((values, path) => {
    if (!fieldPresent(topic, path, message, 'number')) return;

    if (!Number.isNaN(values[message]) || !isItem(path)) place(root, tokens(topic, path), values[message]);
  });
  topic.labels.forEach((values, path) => {
    if (!fieldPresent(topic, path, message, 'label')) return;

    const numeric = topic.numbers.get(path)?.[message];

    if (values[message] === '' && numeric !== undefined && !Number.isNaN(numeric)) return;

    if (topic.presence || values[message] !== '' || !isItem(path)) place(root, tokens(topic, path), values[message]);
  });
  topic.lists.forEach((list, path) => {
    if (fieldPresent(topic, path, message, 'list'))
      place(root, tokens(topic, path), list.v.subarray(list.at[message], list.at[message + 1]));
  });
  topic.blobs.forEach((blob, path) => {
    if (fieldPresent(topic, path, message, 'blob'))
      place(root, tokens(topic, path), blob.bytes.subarray(blob.at[message], blob.at[message + 1]));
  });

  return root;
}

function leafText(value: Decoded): string {
  if (typeof value === 'number') return numberLabel(value);

  if (value instanceof Uint8Array) return fileSize(value.length);

  return String(value);
}

function nodeOf(key: string, value: Decoded): TreeNode {
  if (value instanceof Float64Array) return { key, children: Array.from(value, (v, i) => nodeOf(String(i), v)) };

  if (Array.isArray(value)) return { key, children: value.map((v, i) => nodeOf(String(i), v)) };

  if (value && typeof value === 'object' && !(value instanceof Uint8Array)) return { key, children: treeOf(value) };

  return { key, value: leafText(value) };
}

const treeOf = (message: DecodedMessage): TreeNode[] =>
  Object.entries(message).map(([key, value]) => nodeOf(key, value));

export const messageTree = (topic: RecordedTopic, message: number): TreeNode[] => treeOf(messageAt(topic, message));
