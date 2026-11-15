import React from 'react';
import { Button } from '../../design-system';
import type { RobotMessage } from '../../robot/robotState';
import { robotRunFor } from '../../robot/robotStore';
import { replayable } from '../../robot/runBuffer';

interface RobotMessagesProps {
  messages: RobotMessage[];
  onReplay?: (messageId: number) => void;
}

export const RobotMessages: React.FC<RobotMessagesProps> = ({ messages, onReplay }) =>
  messages.length > 0 && (
    <div className="mb-3" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className="px-1 py-1.5" data-robot-message={m.kind}>
          <p className="text-[13px] leading-snug text-white/90">{m.text}</p>
          {onReplay && m.kind === 'fault' && replayable(robotRunFor(m.id)) && (
            <Button variant="secondary" fullWidth className="mt-2" onClick={() => onReplay(m.id)}>
              Replay in Sim
            </Button>
          )}
        </div>
      ))}
    </div>
  );
