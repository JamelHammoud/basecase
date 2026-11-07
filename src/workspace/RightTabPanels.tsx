import { Activity, useState, type ReactNode } from 'react';
import { AcpStudioPanel } from '../components/AcpStudioPanel';
import { DesktopDownload } from '../components/agent/DesktopDownload';
import { DesignersProvider } from '../components/agent/DesignersContext';
import { PartLinksProvider } from '../components/agent/PartLinksProvider';
import { canRevertLane } from './agentLanes';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { BuildPanel } from '../components/BuildPanel';
import { PosePanel } from '../components/PosePanel';
import { SimulatePanel } from '../components/SimulatePanel';
import type { ProjectSettings } from '../types/robotics';
import { findingQuote, fixPrompt } from '../readiness/readiness';
import { InspectTab } from './InspectTab';
import type { RightTab } from './types';
import type { AgentSession } from './useAgentSession';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface RightTabPanelsProps {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  agent: AgentSession;
}

interface TabActivityProps {
  tab: RightTab;
  current: RightTab;
  visited: ReadonlySet<RightTab>;
  available?: boolean;
  children: ReactNode;
}

function TabActivity({ tab, current, visited, available = true, children }: TabActivityProps) {
  if (!available || !visited.has(tab)) return null;

  return <Activity mode={tab === current ? 'visible' : 'hidden'}>{children}</Activity>;
}

function useVisitedTabs(tab: RightTab) {
  const [visited, setVisited] = useState<ReadonlySet<RightTab>>(() => new Set([tab]));

  if (!visited.has(tab)) setVisited(new Set([...visited, tab]));

  return visited;
}

function BuildTab({ core, agent }: Pick<RightTabPanelsProps, 'core' | 'agent'>) {
  const { docs, parts, project, scene, setSelectedIds, showToast, guide, printing, studio, tool } = core;
  const { setProject } = docs;

  return (
    <BuildPanel
      parts={parts}
      sceneName={scene.sceneName}
      project={project}
      onChangeProject={(patch: Partial<ProjectSettings>) => setProject((p) => ({ ...p, ...patch }))}
      printing={printing}
      printers={studio.printers.printers}
      printTools={studio.printers.printTools}
      onAddPrinter={() => studio.openSettings('printers')}
      onFixFinding={
        IS_WEB_DEMO
          ? undefined
          : (finding) => {
              tool.openRightTab('acp');
              void agent.send({ text: fixPrompt(finding), ...studio.agentChoice }, 'queue');
            }
      }
      onQuoteFinding={IS_WEB_DEMO ? undefined : (finding) => tool.requestQuote(findingQuote(finding, parts))}
      panScroll={studio.trackpadMode === 'pan-scroll'}
      onSelectParts={(ids) => setSelectedIds(ids)}
      onToast={(m) => showToast(m)}
      guide={guide}
      readiness={core.readiness}
    />
  );
}

function useOpenGuide(core: WorkspaceCore) {
  const { guide, tool } = core;

  return () => {
    const ready = !!guide.record && !guide.stale;

    tool.setRightTab('build');
    window.requestAnimationFrame(() => {
      document.getElementById('build-guide')?.scrollIntoView({ block: 'center' });

      if (ready) window.requestAnimationFrame(() => void guide.open());
    });
  };
}

function AgentTab(props: Omit<RightTabPanelsProps, 'actions'>) {
  return IS_WEB_DEMO ? <DesktopDownload /> : <AgentConversationTab {...props} />;
}

function AgentConversationTab({ core, agent }: Omit<RightTabPanelsProps, 'actions'>) {
  const { studio, tool, parts, setSelectedIds } = core;
  const { chat, controls, current } = agent;
  const openGuide = useOpenGuide(core);

  return (
    <PartLinksProvider
      parts={parts}
      panScroll={studio.trackpadMode === 'pan-scroll'}
      onSelect={setSelectedIds}
      onOpenGuide={openGuide}
    >
      <DesignersProvider
        messages={current.messages}
        opened={agent.openedDesigner}
        onOpen={agent.openDesigner}
        onFocus={agent.focusDesigner}
      >
        <AcpStudioPanel
          acpStatus={agent.acpStatus}
          messages={current.messages}
          isBusy={current.busy}
          status={current.status}
          context={current.context}
          canRevert={canRevertLane(current)}
          attachRequest={tool.attachRequest}
          sketchRequest={tool.sketchRequest}
          quote={{ request: tool.quoteRequest, onRequest: tool.requestQuote, onDone: tool.clearQuote }}
          targetHeightMm={studio.agentTargetHeightMm}
          choice={studio.agentChoice}
          onChoiceChange={studio.setAgentChoice}
          onReconnectAcp={studio.reconnectAcp}
          onSignIn={studio.signInAcp}
          onSaveApiKey={studio.saveAgentApiKey}
          onUploadImage={agent.uploadImage}
          queue={agent.queue}
          onSend={agent.send}
          onRetry={agent.retry}
          onStop={() => controls.stop()}
          onNewChat={chat.newChat}
          onRevert={controls.revert}
        />
      </DesignersProvider>
    </PartLinksProvider>
  );
}

export function RightTabPanels({ core, actions, agent }: RightTabPanelsProps) {
  const { tool, posing, onRobot, project, setSelectedIds, simTraining } = core;
  const { pose } = actions;
  const current = tool.rightTab;
  const visited = useVisitedTabs(current);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TabActivity tab="pose" current={current} visited={visited} available={onRobot}>
        <PosePanel
          posing={posing}
          onSelectParts={setSelectedIds}
          onImportMotion={pose.importMotion}
          onWalkCycle={pose.walkCycle}
          canWalk={pose.canWalk}
        />
      </TabActivity>
      <TabActivity tab="sim" current={current} visited={visited} available={posing.hasRig}>
        <SimulatePanel
          sim={simTraining.sim}
          training={simTraining.training}
          cases={simTraining.cases}
          parts={core.parts}
          rig={posing.rig}
          animations={project.animations ?? []}
          policies={simTraining.policies}
          onSelectParts={setSelectedIds}
          onDeletePolicy={simTraining.deletePolicy}
        />
      </TabActivity>
      <TabActivity tab="inspector" current={current} visited={visited}>
        <InspectTab core={core} actions={actions} />
      </TabActivity>
      <TabActivity tab="build" current={current} visited={visited}>
        <BuildTab core={core} agent={agent} />
      </TabActivity>
      <TabActivity tab="acp" current={current} visited={visited}>
        <AgentTab core={core} agent={agent} />
      </TabActivity>
    </div>
  );
}
