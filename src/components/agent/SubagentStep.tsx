import React, { useState } from 'react';
import { AcpToolCallEvent } from '../../types/robotics';
import { Markdown } from '../../design-system';
import { DisclosureBody } from './Disclosure';
import { usePartMarkdown } from './PartLinksProvider';
import { StepRow } from './StepRow';
import { ToolStep } from './ToolStep';
import { toolIcon, toolLabel } from './toolLabel';
import { OpenImages } from './types';

const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

export const isSubagentCall = (call: AcpToolCallEvent) => SUBAGENT_TOOLS.has(call.toolName ?? '');

const isRunning = (status: AcpToolCallEvent['status']) => status === 'pending' || status === 'in_progress';

function titleOf(call: AcpToolCallEvent) {
  const description = (call.rawInput as { description?: unknown } | undefined)?.description;

  return typeof description === 'string' && description ? description : (toolLabel(call)?.title ?? 'Part designer');
}

function partCount(children: AcpToolCallEvent[]) {
  const made = children.filter((c) => /model_part/.test(c.toolName ?? c.title) && c.status === 'completed').length;

  if (!made) return '';

  return made === 1 ? '1 part' : `${made} parts`;
}

const latestStep = (children: AcpToolCallEvent[]) =>
  children
    .toReversed()
    .map((c) => toolLabel(c)?.title)
    .find(Boolean) ?? '';

export const SubagentStep: React.FC<{ call: AcpToolCallEvent; onOpenImages: OpenImages }> = ({
  call,
  onOpenImages,
}) => {
  const [open, setOpen] = useState(false);
  const partLinks = usePartMarkdown();
  const children = call.children ?? [];
  const running = isRunning(call.status);
  const meta = running ? latestStep(children) : partCount(children);
  const report = !running && call.childText ? call.childText.trim() : '';
  const expandable = children.length > 0 || !!report;

  return (
    <div className="min-w-0">
      <StepRow
        icon={toolIcon(call)}
        title={meta ? `${titleOf(call)} · ${meta}` : titleOf(call)}
        running={running}
        failed={call.status === 'failed'}
        expandable={expandable}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      {expandable && (
        <DisclosureBody open={open} onClose={() => setOpen(false)}>
          <div className="pl-6 pr-1 pt-0.5 pb-1 space-y-0.5">
            {children.map((child) => (
              <ToolStep key={child.toolCallId} call={child} onOpenImages={onOpenImages} />
            ))}
            {report && (
              <div className="pt-1.5 text-white/70">
                <Markdown {...partLinks}>{report}</Markdown>
              </div>
            )}
          </div>
        </DisclosureBody>
      )}
    </div>
  );
};
