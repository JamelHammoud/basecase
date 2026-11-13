import React from 'react';
import type { RobotMessage } from '../../robot/robotState';

const KIND: Record<RobotMessage['kind'], string> = {
  fault: 'Stopped by a fault',
  refused: 'Refused',
  stopped: 'Stopped',
  lost: 'Daemon lost',
};

export const RobotMessages: React.FC<{ messages: RobotMessage[] }> = ({ messages }) =>
  messages.length > 0 && (
    <div className="mb-3" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className="px-1 py-1.5">
          <div className="text-[12px] text-white/50">{KIND[m.kind]}</div>
          <p className="text-[13px] leading-snug text-white/90">{m.text}</p>
        </div>
      ))}
    </div>
  );
