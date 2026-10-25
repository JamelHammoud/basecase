import React from 'react';
import { AcpToolCallEvent } from '../../types/robotics';
import { DesignerRow } from './DesignerRow';

export const DesignersCard: React.FC<{ calls: AcpToolCallEvent[] }> = ({ calls }) => (
  <section className="rounded-xl bg-white/[0.035] ring-1 ring-inset ring-white/[0.06] p-1 animate-fade-in min-w-0">
    <header className="h-7 px-2 flex items-center">
      <span className="text-[12.5px] font-medium text-white/60">{calls.length > 1 ? 'Subagents' : 'Subagent'}</span>
    </header>
    <ul>
      {calls.map((call) => (
        <DesignerRow key={call.toolCallId} call={call} />
      ))}
    </ul>
  </section>
);
