import React from 'react';
import type { PlacedArea } from '../../cases/console/layout';
import type { PanelKind, PanelOf, PanelSpec } from '../../cases/console/panelKinds';
import { LAYOUT, ModeHeader, useScrollFade } from '../../design-system';
import type { PanelContext } from './panelContext';
import { PANEL_VIEWS } from './panelViews';

interface CaseRunAreaProps {
  area: PlacedArea;
  side: 'before' | 'after';
  ctx: PanelContext;
  title: string;
  onDone: () => void;
}

function Panel({ panel, ctx }: { panel: PanelSpec; ctx: PanelContext }) {
  const View = PANEL_VIEWS[panel.kind] as React.FC<{ panel: PanelOf<PanelKind>; ctx: PanelContext }>;

  return (
    <div
      data-testid="case-run-panel"
      data-panel={panel.id}
      data-kind={panel.kind}
      className="border-b border-white/[0.06] last:border-b-0 empty:hidden"
    >
      <View panel={panel} ctx={ctx} />
    </div>
  );
}

export const CaseRunArea: React.FC<CaseRunAreaProps> = ({ area, side, ctx, title, onDone }) => {
  const { ref, style } = useScrollFade();

  return (
    <aside
      data-testid="case-run-area"
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: area.size + LAYOUT.panelGap }}
    >
      <div
        className={`h-full flex flex-col overflow-hidden rounded-[12px] ${
          side === 'before' ? 'sidebar-surface' : 'bg-[#1f1f1f]'
        }`}
        style={{ width: area.size, marginLeft: side === 'after' ? LAYOUT.panelGap : 0 }}
      >
        {area.last && <ModeHeader title={title} onDone={onDone} />}
        <div ref={ref} style={style} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {area.panels.map((panel) => (
            <Panel key={panel.id} panel={panel} ctx={ctx} />
          ))}
        </div>
      </div>
    </aside>
  );
};
