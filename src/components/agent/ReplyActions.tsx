import React from 'react';
import { AcpChatMessage } from '../../types/robotics';
import { Button, RefreshIcon, RotateLeftIcon, RunIcon } from '../../design-system';

const ICON = 'w-3.5 h-3.5';

export const ReplyActions: React.FC<{
  reply: AcpChatMessage;
  canRevert: boolean;
  onContinue: () => void;
  onRetry: () => void;
  onRevert: () => void;
}> = ({ reply, canRevert, onContinue, onRetry, onRevert }) => {
  const canContinue = !!reply.stopped && !reply.failed;

  if (!canContinue && !reply.failed && !canRevert) return null;

  return (
    <div className="-mt-2 flex items-center gap-1">
      {reply.failed && (
        <Button size="xs" variant="secondary" icon={<RefreshIcon className={ICON} />} onClick={onRetry}>
          Retry
        </Button>
      )}
      {canContinue && (
        <Button size="xs" variant="secondary" icon={<RunIcon className={ICON} />} onClick={onContinue}>
          Continue
        </Button>
      )}
      {canRevert && (
        <Button size="xs" variant="ghost" icon={<RotateLeftIcon className={ICON} />} onClick={onRevert}>
          Revert Changes
        </Button>
      )}
    </div>
  );
};
