import { AcpToolCallEvent } from '../../types/robotics';
import { plural } from '../../../electron/plural.mjs';
import { isToolRunning, toolKey, toolLabel } from './toolLabel';

const HANDBACK_TOOL = 'SubagentHandback';

const isHandback = (call: AcpToolCallEvent) => call.toolName === HANDBACK_TOOL || call.title === HANDBACK_TOOL;

export const designerSteps = (call: AcpToolCallEvent) =>
  (call.children ?? []).filter((child) => !isHandback(child) && toolLabel(child));

export function handbackMessage(call: AcpToolCallEvent) {
  const handback = call.children?.findLast(isHandback)?.rawInput as { message?: unknown } | undefined;

  return typeof handback?.message === 'string' ? handback.message.trim() : '';
}

export const designerReport = (call: AcpToolCallEvent) => handbackMessage(call) || (call.childText ?? '').trim();

export interface DesignerDetail {
  text: string;
  tone: 'live' | 'quiet' | 'failed';
}

function madeParts(steps: AcpToolCallEvent[]) {
  const made = steps.filter((step) => toolKey(step) === 'model_part' && step.status === 'completed').length;

  return made ? plural(made, 'part') : '';
}

export function designerDetail(call: AcpToolCallEvent, steps: AcpToolCallEvent[]): DesignerDetail {
  if (call.status === 'failed') return { text: 'Couldn’t finish', tone: 'failed' };

  if (call.status === 'completed') return { text: madeParts(steps), tone: 'quiet' };

  return { text: designerActivity(call, steps), tone: 'live' };
}

export function designerActivity(call: AcpToolCallEvent, steps: AcpToolCallEvent[]) {
  const running = steps.findLast(isToolRunning);

  if (running) return toolLabel(running)?.title || 'Working';

  return call.childAt ? 'Thinking' : 'Starting';
}

export const stepCount = (steps: AcpToolCallEvent[]) => plural(steps.length, 'step');
