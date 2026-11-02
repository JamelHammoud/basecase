import React, { useState } from 'react';
import { AcpToolCallEvent } from '../../types/robotics';
import { DisclosureBody } from './Disclosure';
import { StepRow } from './StepRow';
import { ToolStep } from './ToolStep';
import { groupLabel, isToolRunning, toolIcon } from './toolLabel';
import { OpenImages } from './types';

export const ToolGroup: React.FC<{ calls: AcpToolCallEvent[]; onOpenImages: OpenImages }> = ({
  calls,
  onOpenImages,
}) => {
  const [open, setOpen] = useState(false);
  const failed = calls.filter((call) => call.status === 'failed').length;

  return (
    <div className="min-w-0">
      <StepRow
        icon={toolIcon(calls[0])}
        title={groupLabel(calls)}
        running={calls.some(isToolRunning)}
        detail={failed && failed < calls.length ? `${failed} failed` : undefined}
        detailFailed
        failed={failed === calls.length}
        expandable
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      <DisclosureBody open={open}>
        <div className="pl-6">
          {calls.map((call) => (
            <ToolStep key={call.toolCallId} call={call} onOpenImages={onOpenImages} />
          ))}
        </div>
      </DisclosureBody>
    </div>
  );
};
