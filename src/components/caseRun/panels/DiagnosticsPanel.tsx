import React from 'react';
import { diagnosticsAt } from '../../../topics/diagnostics';
import { useBus, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { DIAGNOSTIC_TONES } from './topicRows';

export const DiagnosticsPanel: React.FC<PanelViewProps<'diagnostics'>> = ({ panel, ctx }) => {
  const bus = useBus(ctx.bus);
  const index = bus.topics?.() ?? null;
  const head = bus.playhead();

  if (!index || !head) return null;

  const rows = diagnosticsAt(index, { topic: panel.topic, at: head.at });

  if (!rows.length) return null;

  return (
    <Titled title={panel.title}>
      <div className="flex flex-col text-[13px] leading-[18px]">
        {rows.map((row) => (
          <div
            key={row.name}
            data-testid="diagnostic"
            data-level={row.level}
            className="min-h-[28px] py-[5px] flex items-start gap-2"
          >
            <span className="min-w-0 flex-1 break-words text-white/90">{row.name}</span>
            <span className={`shrink-0 w-[40px] ${DIAGNOSTIC_TONES[row.level]}`}>{row.level}</span>
            <span className={`min-w-0 flex-1 break-words ${row.level === 'stale' ? 'text-white/50' : 'text-white/60'}`}>
              {row.message}
            </span>
          </div>
        ))}
      </div>
    </Titled>
  );
};
