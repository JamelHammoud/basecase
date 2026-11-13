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
import { measuredJoints } from '../reality/measuredJoints';
import type { ProjectSettings } from '../types/robotics';
import { caseCheckId, caseCheckOf } from '../readiness/caseChecks';
import { findingQuote, fixPrompt } from '../readiness/readiness';
import { showNewCase } from './caseCommands';
import { calibrateJoints } from './operateCommands';
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
  const { docs, parts, project, scene, setSelectedIds, showToast, guide, printing, studio, tool, simTraining } = core;
  const { setProject } = docs;

  return (
    <BuildPanel
      parts={parts}
      sceneName={scene.sceneName}
      project={project}
      onChangeProject={(patch: Partial<ProjectSettings>) => setProject((p) => ({ ...p, ...patch }))}
      printing={printing}
      onFixFinding={
        IS_WEB_DEMO
          ? undefined
          : (finding) => {
              tool.openRightTab('acp');
              void agent.send({ text: fixPrompt(finding), ...studio.agentChoice }, 'queue');
            }
      }
      onQuoteFinding={IS_WEB_DEMO ? undefined : (finding) => tool.requestQuote(findingQuote(finding, parts))}
      onOpenCase={(id) => {
        simTraining.cases.open(id);
        tool.setRightTab('sim');
      }}
      onNewCase={simTraining.cases.builder.goals.length ? () => showNewCase(core) : undefined}
      onCalibrate={IS_WEB_DEMO ? undefined : (jointIds) => calibrateJoints(core, jointIds)}
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

function openCaseCheck(core: WorkspaceCore, caseId: string) {
  core.tool.setRightTab('build');
  window.requestAnimationFrame(() => {
    const row = document.getElementById(caseCheckId(caseId));

    row?.scrollIntoView({ block: 'center' });
    row?.focus({ preventScroll: true });
  });
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
          compose={{ request: tool.composeRequest, onDone: tool.clearCompose }}
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

function useTeach(core: WorkspaceCore, agent: AgentSession) {
  if (IS_WEB_DEMO) return null;

  return (goal: string) => {
    core.tool.openRightTab('acp');
    void agent.send({ text: `/train ${goal}`, ...core.studio.agentChoice }, 'queue');
  };
}

export function RightTabPanels({ core, actions, agent }: RightTabPanelsProps) {
  const { tool, posing, posable, project, setSelectedIds, simTraining } = core;
  const { pose } = actions;
  const onTeach = useTeach(core, agent);
  const current = tool.rightTab;
  const visited = useVisitedTabs(current);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TabActivity tab="pose" current={current} visited={visited} available={posable}>
        <PosePanel
          posing={posing}
          jointEdits={actions.joints}
          skeleton={core.skeleton}
          onSelectParts={setSelectedIds}
          onImportMotion={pose.importMotion}
          onWalkCycle={pose.walkCycle}
          canWalk={pose.canWalk}
          measured={measuredJoints({
            joints: project.joints ?? [],
            parts: core.parts,
            calibrations: project.servoCalibrations,
          })}
        />
      </TabActivity>
      <TabActivity tab="sim" current={current} visited={visited} available={posing.hasRig}>
        <SimulatePanel
          sim={simTraining.sim}
          training={simTraining.training}
          cases={simTraining.cases}
          share={simTraining.share}
          parts={core.parts}
          rig={posing.rig}
          animations={project.animations ?? []}
          policies={simTraining.policies}
          onSelectParts={setSelectedIds}
          onDeletePolicy={simTraining.deletePolicy}
          caseCheck={simTraining.cases.active && caseCheckOf(core.readiness.current, simTraining.cases.active.id)}
          onOpenCaseCheck={() => simTraining.cases.active && openCaseCheck(core, simTraining.cases.active.id)}
          skills={simTraining.skills}
          onTeach={onTeach}
          onRunCase={core.caseRun.enter}
          compare={core.caseCompare}
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
