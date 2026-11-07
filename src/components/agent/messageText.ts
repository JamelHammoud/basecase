import type { ContextMenuEntry } from '../../design-system';
import { AcpChatMessage, MessageQuote } from '../../types/robotics';

export type Segment = NonNullable<AcpChatMessage['segments']>[number];

const MODEL_CREATED = /\[MODEL_CREATED:[^\]]+\]/g;

export const stripMarkers = (text: string) => text.replace(MODEL_CREATED, '').trim();

export function segmentsOf(msg: AcpChatMessage): Segment[] {
  if (msg.segments) return msg.segments;

  const text = stripMarkers(msg.text);

  return [
    ...(msg.thought ? [{ type: 'thought' as const, text: msg.thought }] : []),
    ...(msg.toolCalls ?? []).map((tc) => ({ type: 'tool' as const, toolCallId: tc.toolCallId })),
    ...(text ? [{ type: 'text' as const, text }] : []),
  ];
}

export function messageText(msg: AcpChatMessage): string {
  if (msg.role === 'user') {
    return [...(msg.quotes ?? []).map((q) => `> ${q.text}`), msg.text.trim()].filter(Boolean).join('\n\n');
  }

  return segmentsOf(msg)
    .flatMap((seg) => (seg.type === 'text' ? [stripMarkers(seg.text)] : []))
    .filter(Boolean)
    .join('\n\n');
}

const copyText = (text: string) => void navigator.clipboard.writeText(text);

export function copyMenuItems(text: string): ContextMenuEntry[] {
  const selected = window.getSelection()?.toString() ?? '';

  return [
    ...(selected.trim() ? [{ label: 'Copy', shortcut: '⌘C', onSelect: () => copyText(selected) }] : []),
    ...(text ? [{ label: 'Copy Message', onSelect: () => copyText(text) }] : []),
  ];
}

const MARKDOWN_SYNTAX: Array<[RegExp, string]> = [
  [/^```.*$/gm, ''],
  [/^ {0,3}(?:#{1,6}|>) +/gm, ''],
  [/!?\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/\*\*|`/g, ''],
];

const plainText = (markdown: string) =>
  MARKDOWN_SYNTAX.reduce((text, [syntax, plain]) => text.replace(syntax, plain), markdown).trim();

const ownText = (msg: AcpChatMessage) => msg.text.trim() || (msg.quotes ?? []).map((quote) => quote.text).join('\n\n');

export function messageQuote(msg: AcpChatMessage): MessageQuote | null {
  const text = plainText(msg.role === 'user' ? ownText(msg) : messageText(msg));

  if (!text) return null;

  return { id: msg.id, source: msg.role === 'user' ? 'my message' : 'your reply', text };
}

export function messageMenuItems(msg: AcpChatMessage, onQuote: (quote: MessageQuote) => void): ContextMenuEntry[] {
  const quote = messageQuote(msg);

  return [
    ...copyMenuItems(messageText(msg)),
    ...(quote ? [{ label: 'Quote Message', onSelect: () => onQuote(quote) }] : []),
  ];
}
