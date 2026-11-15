import type { TryHit } from './types';

export const newestFirst = (a: TryHit, b: TryHit) => b.startedAt.localeCompare(a.startedAt);

const byScore = (a: TryHit, b: TryHit) => b.score - a.score || newestFirst(a, b);

function restoreWorst(heap: number[], compare: (a: number, b: number) => number, start: number) {
  const held = heap[start];
  let at = start;

  while (at * 2 + 1 < heap.length) {
    const left = at * 2 + 1;
    const right = left + 1;
    const child = right < heap.length && compare(heap[right], heap[left]) > 0 ? right : left;

    if (compare(heap[child], held) <= 0) break;

    heap[at] = heap[child];
    at = child;
  }

  heap[at] = held;
}

export function rankedHits(hits: TryHit[], limit: number, compare = byScore): TryHit[] {
  const end = Math.trunc(limit) || 0;
  const count = Math.min(hits.length, end < 0 ? Math.max(0, hits.length + end) : end);

  if (!count) return [];

  if (count === hits.length) return hits.sort(compare);

  const order = (a: number, b: number) => compare(hits[a], hits[b]) || a - b;
  const heap = Array.from({ length: count }, (_, i) => i);

  for (let i = (count >> 1) - 1; i >= 0; i--) restoreWorst(heap, order, i);

  for (let i = count; i < hits.length; i++) {
    if (order(i, heap[0]) >= 0) continue;

    heap[0] = i;
    restoreWorst(heap, order, 0);
  }

  return heap.sort(order).map((i) => hits[i]);
}
