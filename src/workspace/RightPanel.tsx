import { PrintPanel } from '../components/print/PrintPanel';
import { LAYOUT, PanelResizer } from '../design-system';
import { RightPanelTabs } from './RightPanelTabs';
import { RightTabPanels } from './RightTabPanels';
import type { AgentSession } from './useAgentSession';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';

interface RightPanelProps {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
  agent: AgentSession;
}

export function RightPanel({ core, actions, ui, agent }: RightPanelProps) {
  const { isRightOpen, panelWidths, resizingPanel } = core.studio;

  return (
    <aside
      aria-hidden={!isRightOpen}
      className={`relative h-full shrink-0 overflow-hidden ${
        resizingPanel === 'right' ? '' : 'transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]'
      }`}
      style={{ width: isRightOpen ? panelWidths.right + LAYOUT.panelGap : 0 }}
    >
      {isRightOpen && (
        <PanelResizer
          edge="left"
          width={panelWidths.right}
          min={LAYOUT.rightPanelMin}
          max={LAYOUT.rightPanelMax}
          defaultWidth={LAYOUT.rightPanelWidth}
          onResize={ui.resizeRight}
          onCollapse={ui.collapseRight}
          onResizingChange={ui.resizingRight}
        />
      )}
      <div
        className="h-full flex flex-col overflow-hidden bg-[#1f1f1f] rounded-[12px]"
        style={{ width: panelWidths.right, marginLeft: LAYOUT.panelGap }}
      >
        {core.printing.mode ? (
          <PrintPanel
            printing={core.printing}
            parts={core.parts}
            project={core.project}
            printers={core.studio.printers.printers}
            tools={core.studio.printers.printTools}
            onChangeProject={(patch) => core.docs.setProject((p) => ({ ...p, ...patch }))}
            onAddPrinter={() => core.studio.openSettings('printers')}
            onDone={core.printing.closeMode}
          />
        ) : (
          <>
            <RightPanelTabs core={core} agent={agent} />
            <RightTabPanels core={core} actions={actions} agent={agent} />
          </>
        )}
      </div>
    </aside>
  );
}
