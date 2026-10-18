import { Activity, useState, type ReactNode } from 'react';
import { AcpStudioPanel } from '../components/AcpStudioPanel';
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
  const { docs, parts, project, scene, viewportRef, setSelectedIds, showToast } = core;
  const { partsRef, projectRef, setProject } = docs;

  return (
    <BuildPanel
      parts={parts}
      sceneName={scene.sceneName}
      project={project}
      onChangeProject={(patch: Partial<ProjectSettings>) => setProject((p) => ({ ...p, ...patch }))}
      measure={(ids?: string[]) => viewportRef.current?.measureParts(ids) ?? {}}
      getTriangles={(id: string) => viewportRef.current?.partTriangles(id) ?? null}
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
    />
  );
}

function AgentTab({ core, agent }: Omit<RightTabPanelsProps, 'actions'>) {
  const { studio, tool, parts } = core;
  const { chat, run } = agent;

  return (
    <AcpStudioPanel
      acpStatus={agent.acpStatus}
      messages={chat.messages}
      isBusy={run.isBusy}
      status={run.status}
      canRevert={!!chat.runBase && chat.runBase !== parts}
      attachRequest={tool.attachRequest}
      targetHeightMm={studio.agentTargetHeightMm}
      onReconnectAcp={studio.reconnectAcp}
      onUploadImage={agent.uploadImage}
      onSend={run.send}
      onStop={run.stop}
      onNewChat={chat.newChat}
      onRevert={run.revert}
    />
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
