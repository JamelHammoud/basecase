import { describeCondition } from './explainGraph';
import type { FlowNode } from './flowTypes';
import { findNode } from './nodes';
import type { Condition } from './schema';

export interface NodeLabel {
  kind: string;
  text: string;
}

const KIND_WORDS: Record<string, string> = {
  base: 'Keep doing',
  watcher: 'Watch',
  reaction: 'When',
  do: 'Do',
  say: 'Say',
  infer: 'Check',
  ask: 'Ask',
  if: 'If',
  wait: 'Wait',
  together: 'Together',
};

const words = (id: string) => id.replace(/-/g, ' ');
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const quoted = (text: unknown) => `“${String(text ?? '')}”`;

const sentence = (cond: unknown) => capitalised(describeCondition(cond as Condition));
const modelLabel = (d: Record<string, unknown>) => findNode(String(d.model))?.label ?? String(d.model);

const TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  base: (d) => capitalised(words(String(d.skill))),
  do: (d) => capitalised(words(String(d.skill))),
  say: (d) => quoted(d.text),
  infer: modelLabel,
  watcher: modelLabel,
  ask: (d) => quoted(d.prompt),
  if: (d) => sentence(d.test),
  reaction: (d) => sentence(d.when),
  wait: (d) => (d.until ? sentence(d.until) : `${Number(d.ms ?? 0) / 1000} s`),
  together: (d) => (d.join === 'any' ? 'First to finish' : 'All at once'),
};

export function nodeLabel(node: FlowNode): NodeLabel {
  return { kind: KIND_WORDS[node.kind] ?? '', text: TEXT[node.kind]?.(node.data) ?? '' };
}
