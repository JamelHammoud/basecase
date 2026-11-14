import type { RecordedTopic } from './topicLog';

export function markPresent(masks: Map<string, number[]>, path: string, message: number) {
  const mask = masks.get(path) ?? [];
  const word = Math.floor(message / 8);

  mask[word] = (mask[word] ?? 0) | (1 << (message % 8));
  masks.set(path, mask);
}

function changesShape(masks: Map<string, number[]>) {
  const paths = new Set([...masks.keys()].map((key) => key.slice(key.indexOf(':') + 1)));

  if (paths.size !== masks.size) return true;

  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const boundary = path[i] === '.' || path[i] === '[';

      if (boundary && paths.has(path.slice(0, i))) return true;
    }
  }

  return false;
}

export function sortedPresence(masks: Map<string, number[]>, order: number[]): Map<string, Uint8Array> | null {
  if (!changesShape(masks)) return null;

  const out = new Map<string, Uint8Array>();

  for (const path of [...masks.keys()].sort()) {
    const source = masks.get(path)!;
    const bits = new Uint8Array(Math.ceil(order.length / 8));

    order.forEach((old, i) => {
      if ((source[Math.floor(old / 8)] & (1 << (old % 8))) !== 0) bits[Math.floor(i / 8)] |= 1 << (i % 8);
    });
    out.set(path, bits);
  }

  return out;
}

export function fieldPresent(topic: RecordedTopic, path: string, message: number, kind: string): boolean {
  if (!topic.presence) return true;

  const mask = topic.presence.get(`${kind}:${path}`);

  return !!mask && (mask[Math.floor(message / 8)] & (1 << (message % 8))) !== 0;
}
