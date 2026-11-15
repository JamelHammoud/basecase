import { pointKey, type Edge } from './profileLoops';
import { pairKey } from '../../electron/cad-kernel/pairKey.mjs';

type Point = Edge[number];

export class CapBoundary {
  private counts = new Map<string, { edge: Edge; count: number }>();

  add(a: Point, b: Point, c: Point): void {
    const ka = pointKey(a);
    const kb = pointKey(b);
    const kc = pointKey(c);

    this.addEdge(a, b, ka, kb);
    this.addEdge(b, c, kb, kc);
    this.addEdge(c, a, kc, ka);
  }

  private addEdge(a: Point, b: Point, ka: string, kb: string): void {
    const key = pairKey(ka, kb);
    const found = this.counts.get(key);

    if (found) {
      found.count++;

      return;
    }

    this.counts.set(key, { edge: [a, b], count: 1 });
  }

  edges(): Edge[] | undefined {
    const edges: Edge[] = [];

    for (const { edge, count } of this.counts.values()) {
      if (count > 2) return undefined;

      if (count === 1) edges.push(edge);
    }

    return edges;
  }
}
