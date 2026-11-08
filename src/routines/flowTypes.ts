import type { Step } from './schema';

export type FlowNodeKind = 'base' | 'watcher' | 'reaction' | 'end' | Step['kind'];
export type FlowEdgeKind = 'next' | 'then' | 'else' | 'timeout' | 'fail' | 'branch' | 'trigger';

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  data: Record<string, unknown>;
}

export interface FlowEdge {
  from: string;
  to: string;
  kind: FlowEdgeKind;
}

export interface Flow {
  routine: Record<string, unknown>;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type NodeState = 'idle' | 'active' | 'done' | 'failed' | 'timedOut' | 'cancelled' | 'then' | 'else';

export const CHILD_KEYS = ['then', 'else', 'branches', 'onTimeout', 'onFail', 'steps'] as const;

export const GUARD_EDGES = [
  ['onTimeout', 'timeout'],
  ['onFail', 'fail'],
] as const;

export const GUARDED_NODE_KINDS: ReadonlySet<FlowNodeKind> = new Set(['base', 'do', 'say', 'infer', 'ask', 'wait']);

export function withoutChildren(value: object): Record<string, unknown> {
  const skip = new Set<string>(CHILD_KEYS);

  return Object.fromEntries(Object.entries(structuredClone(value)).filter(([key]) => !skip.has(key)));
}

export const endNodeId = (from: string, kind: string) => `end:${from}:${kind}`;
