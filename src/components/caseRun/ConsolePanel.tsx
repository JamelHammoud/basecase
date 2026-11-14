import React from 'react';
import type { PanelKind, PanelOf, PanelSpec } from '../../cases/console/panelKinds';
import { ErrorBoundary, RenameField } from '../../design-system';
import type { PanelContext } from './panelContext';
import { PANEL_VIEWS } from './panelViews';

export interface PanelArranging {
  dragging: boolean;
  renaming: boolean;
  surface: string;
  onGrab: (e: React.PointerEvent<HTMLElement>) => void;
  onRenamed: (title: string | null) => void;
}

interface ConsolePanelProps {
  panel: PanelSpec;
  ctx: PanelContext;
  arranging: PanelArranging | null;
}

const TITLED_GRIP = 48;
const EDGE_GRIP = 12;

const headed = (panel: PanelSpec) => !!panel.title && panel.kind !== 'button';

export const ConsolePanel: React.FC<ConsolePanelProps> = ({ panel, ctx, arranging }) => {
  const View = PANEL_VIEWS[panel.kind] as React.FC<{ panel: PanelOf<PanelKind>; ctx: PanelContext }>;

  return (
    <div
      data-testid="case-run-panel"
      data-panel={panel.id}
      data-kind={panel.kind}
      className={`relative border-b border-white/[0.06] last:border-b-0 has-[>[data-panel-body]:empty]:hidden transition-opacity ${
        arranging?.dragging ? 'opacity-40' : ''
      }`}
    >
      <div data-panel-body>
        <ErrorBoundary region={panel.title || 'Panel'} className="flex-col py-[24px]">
          <View panel={panel} ctx={ctx} />
        </ErrorBoundary>
      </div>
      {arranging && (
        <div
          data-testid="panel-grip"
          onPointerDown={arranging.onGrab}
          className="absolute top-0 inset-x-0 z-10 cursor-grab"
          style={{ height: headed(panel) ? TITLED_GRIP : EDGE_GRIP }}
        />
      )}
      {arranging?.renaming && (
        <div className={`absolute top-0 inset-x-0 z-20 h-[48px] px-[12px] flex items-center ${arranging.surface}`}>
          <RenameField name={panel.title ?? ''} onDone={arranging.onRenamed} />
        </div>
      )}
    </div>
  );
};
