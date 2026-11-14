import { describeCondition, span } from './explainGraph';
import type { FlowNode } from './flowTypes';
import { findNode } from './nodes';
import type { Condition, Motion } from './schema';

export interface NodeLabel {
  kind: string;
  text: string;
}

type Data = Record<string, unknown>;

const KIND_WORDS: Record<string, string> = {
  base: 'Start',
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
const rounded = (n: number) => Math.round(n * 100) / 100;

const sentence = (cond: unknown) => capitalised(describeCondition(cond as Condition));
const modelLabel = (d: Data) => findNode(String(d.model))?.label ?? String(d.model);

const HEADINGS: Record<number, string> = { 0: 'ahead', 90: 'left', [-90]: 'right', 180: 'back', [-180]: 'back' };

function driveText(move: Motion): string {
  const heading = move.heading ?? 0;
  const way = HEADINGS[heading] ?? `at ${heading}°`;

  return `${rounded(move.distance ?? 0)} m ${way}`;
}

const turnText = (turn: number) => `${Math.abs(turn)}° ${turn >= 0 ? 'left' : 'right'}`;

function motionLabel(d: Data): NodeLabel | null {
  const move = d.move as Motion | undefined;

  if (move?.distance !== undefined) return { kind: 'Drive', text: driveText(move) };

  if (move?.turn !== undefined) return { kind: 'Turn', text: turnText(move.turn) };

  return d.skill === 'settle' ? { kind: 'Stop', text: 'Settle to neutral' } : null;
}

const TEXT: Record<string, (d: Data) => string> = {
  base: (d) => `${capitalised(words(String(d.skill)))} for ${span(Number(d.timeoutMs ?? 0))}`,
  do: (d) => capitalised(words(String(d.skill))),
  say: (d) => quoted(d.text),
  infer: modelLabel,
  watcher: modelLabel,
  ask: (d) => quoted(d.prompt),
  if: (d) => sentence(d.test),
  reaction: (d) => sentence(d.when),
  wait: (d) => (d.until ? sentence(d.until) : span(Number(d.ms ?? 0))),
  together: (d) => (d.join === 'any' ? 'First to finish' : 'All at once'),
};

export function nodeLabel(node: FlowNode): NodeLabel {
  const moved = node.kind === 'do' ? motionLabel(node.data) : null;

  return moved ?? { kind: KIND_WORDS[node.kind] ?? '', text: TEXT[node.kind]?.(node.data) ?? '' };
}

const NAMED_BY_TEXT = new Set(['Do', 'Check', 'Watch']);

export function stepTitle(node: FlowNode): string {
  const label = nodeLabel(node);

  return NAMED_BY_TEXT.has(label.kind) ? label.text : label.kind;
}
