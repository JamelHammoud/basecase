import type { ContextMenuEntry } from '../../design-system';
import { AcpChatMessage } from '../../types/robotics';

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
  if (msg.role === 'user') return msg.text.trim();

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
