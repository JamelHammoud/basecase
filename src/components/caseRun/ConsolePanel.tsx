import React from 'react';
import { panelName } from '../../cases/console/consoleEdits';
import type { PanelKind, PanelOf, PanelSpec } from '../../cases/console/panelKinds';
import { RenameField } from '../../design-system';
import type { PanelContext } from './panelContext';
import { PANEL_VIEWS } from './panelViews';

interface ConsolePanelProps {
  panel: PanelSpec;
  ctx: PanelContext;
  editable: boolean;
  dragging: boolean;
  surface: string;
  onRenamed: ((title: string | null) => void) | null;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({ panel, ctx, editable, dragging, surface, onRenamed }) => {
  const View = PANEL_VIEWS[panel.kind] as React.FC<{ panel: PanelOf<PanelKind>; ctx: PanelContext }>;

  return (
    <div
      data-testid="case-run-panel"
      data-panel={panel.id}
      data-kind={panel.kind}
      className={`relative border-b border-white/[0.06] last:border-b-0 empty:hidden ${
        editable ? '[&>section>header]:cursor-grab' : ''
      } ${dragging ? 'opacity-40' : ''}`}
    >
      {editable && <div aria-hidden className="absolute inset-x-0 top-0 h-[8px] z-10 cursor-grab" />}
      <View panel={panel} ctx={ctx} />
      {onRenamed && (
        <div className={`absolute inset-x-0 top-0 z-20 h-[48px] px-[12px] flex items-center ${surface}`}>
          <RenameField name={panelName(panel)} onDone={onRenamed} />
        </div>
      )}
    </div>
  );
};
