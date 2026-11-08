import { type Flow, type FlowEdgeKind, type FlowNode, GUARD_EDGES, GUARDED_NODE_KINDS } from './flowTypes';

type Data = Record<string, unknown>;

const MAX_NODES = 4096;

class FlowReader {
  private readonly byId = new Map<string, FlowNode>();
  private readonly out = new Map<string, Array<{ to: string; kind: FlowEdgeKind }>>();
  private readonly seen = new Set<string>();
  private readonly flow: Flow;

  constructor(flow: Flow) {
    this.flow = flow;

    if (flow.nodes.length > MAX_NODES) throw new Error('Too many nodes');

    for (const node of flow.nodes) this.byId.set(node.id, node);

    for (const edge of flow.edges) {
      const list = this.out.get(edge.from) ?? [];

      list.push({ to: edge.to, kind: edge.kind });
      this.out.set(edge.from, list);
    }
  }

  private targets(id: string, kind: FlowEdgeKind): string[] {
    return (this.out.get(id) ?? []).filter((e) => e.kind === kind).map((e) => e.to);
  }

  private target(id: string, kind: FlowEdgeKind): string | undefined {
    return this.targets(id, kind)[0];
  }

  private sequence(start: string | undefined): Data[] {
    const steps: Data[] = [];
    let current = start;

    while (current !== undefined && this.byId.get(current)?.kind !== 'end') {
      steps.push(this.step(current));
      current = this.target(current, 'next');
    }

    return steps;
  }

  private step(id: string): Data {
    const node = this.byId.get(id);

    if (!node || this.seen.has(id)) throw new Error(`Can't read node ${id}`);

    this.seen.add(id);

    const step: Data = structuredClone(node.data);

    if (GUARDED_NODE_KINDS.has(node.kind)) this.guard(id, step);
    else if (node.kind === 'if') {
      step.then = this.sequence(this.target(id, 'then'));
      step.else = this.sequence(this.target(id, 'else'));
    } else if (node.kind === 'together') {
      step.branches = this.targets(id, 'branch').map((t) => this.sequence(t));
    }

    return step;
  }

  private guard(id: string, step: Data) {
    for (const [key, kind] of GUARD_EDGES) {
      const to = this.target(id, kind);

      if (to !== undefined) step[key] = this.sequence(to);
    }
  }

  routine(): Data {
    const nodes = this.flow.nodes;
    const base = nodes.find((n) => n.kind === 'base');

    if (!base) throw new Error('No base');

    return {
      ...structuredClone(this.flow.routine),
      base: this.step(base.id),
      watchers: nodes.filter((n) => n.kind === 'watcher').map((n) => structuredClone(n.data)),
      reactions: nodes
        .filter((n) => n.kind === 'reaction')
        .map((n) => ({ ...structuredClone(n.data), steps: this.sequence(this.target(n.id, 'next')) })),
    };
  }
}

export function flowToRoutine(flow: Flow): unknown {
  try {
    return new FlowReader(flow).routine();
  } catch {
    return null;
  }
}
