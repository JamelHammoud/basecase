import React from 'react';
import { panelName } from '../../cases/console/panelNames';
import type { PanelKind, PanelOf, PanelSpec } from '../../cases/console/panelKinds';
import { ErrorBoundary, RenameField } from '../../design-system';
import type { ConsoleEditor } from './consoleEditor';
import type { PanelContext } from './panelContext';
import { PANEL_VIEWS } from './panelViews';

interface ConsolePanelProps {
  panel: PanelSpec;
  ctx: PanelContext;
  editor: ConsoleEditor | null;
  renaming: boolean;
  onRenamed: () => void;
  dropAbove: boolean;
}

export function DropLine({ at }: { at: 'top' | 'bottom' }) {
  return (
    <span
      data-testid="console-drop"
      className={`pointer-events-none absolute left-[8px] right-[8px] z-20 h-[2px] rounded-full bg-[#0d99ff] ${
        at === 'top' ? '-top-px' : '-bottom-px'
      }`}
    />
  );
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({ panel, ctx, editor, renaming, onRenamed, dropAbove }) => {
  const View = PANEL_VIEWS[panel.kind] as React.FC<{ panel: PanelOf<PanelKind>; ctx: PanelContext }>;
  const lifted = editor?.drag?.panel.id === panel.id;

  return (
    <div
      data-testid="case-run-panel"
      data-panel={panel.id}
      data-kind={panel.kind}
      onPointerDown={editor ? (e) => editor.startDrag(e, panel) : undefined}
      className={`relative border-b border-white/[0.06] last:border-b-0 empty:hidden transition-opacity duration-150 ${
        lifted ? 'opacity-40' : ''
      }`}
    >
      {dropAbove && <DropLine at="top" />}
      <ErrorBoundary region={panel.title || 'Panel'} className="flex-col py-[24px]">
        <View panel={panel} ctx={ctx} />
      </ErrorBoundary>
      {renaming && editor && (
        <div className="absolute left-[8px] right-[8px] top-[8px] z-20 flex rounded-[8px] bg-[#1f1f1f]">
          <RenameField
            name={panelName(panel)}
            onDone={(title) => {
              onRenamed();

              if (title) editor.rename(panel.id, title);
            }}
          />
        </div>
      )}
    </div>
  );
};
