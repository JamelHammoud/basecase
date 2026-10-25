import { AcpToolCallEvent } from '../../types/robotics';
import { toolKey, toolLabel } from './toolLabel';

const HANDBACK_TOOL = 'SubagentHandback';

const isHandback = (call: AcpToolCallEvent) => call.toolName === HANDBACK_TOOL || call.title === HANDBACK_TOOL;

export const designerSteps = (call: AcpToolCallEvent) =>
  (call.children ?? []).filter((child) => !isHandback(child) && toolLabel(child));

export function designerReport(call: AcpToolCallEvent) {
  const handback = call.children?.findLast(isHandback)?.rawInput as { message?: unknown } | undefined;
  const message = typeof handback?.message === 'string' ? handback.message : '';

  return (message || call.childText || '').trim();
}

export interface DesignerDetail {
  text: string;
  tone: 'live' | 'quiet' | 'failed';
}

const counted = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function madeParts(steps: AcpToolCallEvent[]) {
  const made = steps.filter((step) => toolKey(step) === 'model_part' && step.status === 'completed').length;

  return made ? counted(made, 'part') : '';
}

export function designerDetail(call: AcpToolCallEvent, steps: AcpToolCallEvent[]): DesignerDetail {
  if (call.status === 'failed') return { text: 'Couldn’t finish', tone: 'failed' };

  if (call.status === 'completed') return { text: madeParts(steps), tone: 'quiet' };

  const last = steps.at(-1);
  const latest = last ? toolLabel(last)?.title : '';

  return { text: latest || 'Starting', tone: 'live' };
}

export const stepCount = (steps: AcpToolCallEvent[]) => counted(steps.length, 'step');
