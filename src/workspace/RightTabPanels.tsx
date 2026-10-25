import { Activity, useState, type ReactNode } from 'react';
import { AcpStudioPanel } from '../components/AcpStudioPanel';
import { DesignersProvider } from '../components/agent/DesignersContext';
import { PartLinksProvider } from '../components/agent/PartLinksProvider';
import { canRevertLane } from './agentLanes';
import { BuildPanel } from '../components/BuildPanel';
import { PosePanel } from '../components/PosePanel';
import { SimulatePanel } from '../components/SimulatePanel';
import type { ProjectSettings } from '../types/robotics';
import { runEngineeringNow } from './engineeringNow';
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

function BuildTab({ core }: Pick<RightTabPanelsProps, 'core'>) {
  const { docs, parts, project, scene, viewportRef, setSelectedIds, showToast, guide } = core;
  const { partsRef, projectRef, setProject } = docs;

  return (
    <BuildPanel
      parts={parts}
      sceneName={scene.sceneName}
      project={project}
      onChangeProject={(patch: Partial<ProjectSettings>) => setProject((p) => ({ ...p, ...patch }))}
      measure={async (ids?: string[]) => (await viewportRef.current?.measureParts(ids)) ?? {}}
      printShapes={async (ids: string[]) => (await viewportRef.current?.printShapes(ids)) ?? {}}
      onRunChecks={() =>
        runEngineeringNow({
          viewport: viewportRef.current,
          parts: partsRef.current,
          project: projectRef.current,
          withSweep: true,
        })
      }
      onSelectParts={(ids) => setSelectedIds(ids)}
      onToast={(m) => showToast(m)}
      guide={guide}
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

function AgentTab({ core, agent }: Omit<RightTabPanelsProps, 'actions'>) {
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
          targetHeightMm={studio.agentTargetHeightMm}
          choice={studio.agentChoice}
          onChoiceChange={studio.setAgentChoice}
          onReconnectAcp={studio.reconnectAcp}
          onSignIn={studio.signInAcp}
          onSaveApiKey={studio.saveAgentApiKey}
          onUploadImage={agent.uploadImage}
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
        <BuildTab core={core} />
      </TabActivity>
      <TabActivity tab="acp" current={current} visited={visited}>
        <AgentTab core={core} agent={agent} />
      </TabActivity>
    </div>
  );
}
