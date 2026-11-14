import React, { useState } from 'react';
import { ContextMenu, ContextMenuEntry, deleteEntry, ShareIcon, useScrollFade } from '../design-system';
import type { PolicyRecord, RobotAnimation, ScenePart } from '../types/robotics';
import { withVelocity } from '../sim/driveAccess';
import type { Simulation } from '../sim/useSimulation';
import type { SkillRow } from '../skills/skillRows';
import type { SnapshotRef } from '../skills/snapshots';
import type { Training } from '../sim/useTraining';
import type { Rig } from '../utils/kinematics';
import type { Cases } from '../workspace/useCases';
import type { CaseCheck } from '../readiness/caseChecks';
import type { ShareRobot } from '../workspace/useShareRobot';
import type { SceneSkills } from '../workspace/useSkills';
import { useTrainingWatch } from '../workspace/useTrainingWatch';
import { watchSubject } from '../workspace/watchSubject';
import { CaseSection, TrySection } from './simulate/CaseSections';
import { ControlSection, useChooseController, type WalkTeaching } from './simulate/ControlSection';
import { ResultsSection } from './simulate/ResultsSection';
import type { CaseCompare } from '../workspace/useCaseCompare';
import type { CaseExplore } from '../workspace/useCaseExplore';
import { SimControls } from './simulate/SimControls';
import { TrainSection, type CoachSend } from './simulate/TrainSection';
import { coachMenuItems } from './simulate/skillMenu';

interface SimulatePanelProps {
  sim: Simulation;
  training: Training;
  cases: Cases;
  share: ShareRobot;
  rig: Rig;
  parts: ScenePart[];
  animations: RobotAnimation[];
  policies: PolicyRecord[];
  onSelectParts: (ids: string[]) => void;
  onDeletePolicy: (id: string) => void;
  caseCheck: CaseCheck | null;
  onOpenCaseCheck: () => void;
  skills: SceneSkills;
  onTeach: ((goal: string) => void) | null;
  onCoach: CoachSend | null;
  onRunCase: () => void;
  compare: CaseCompare;
  explore: CaseExplore;
  sceneName: string;
  onToast: (message: string) => void;
  onPublishSkill: ((row: SkillRow) => void) | null;
}

function useWalkTeaching(skills: SceneSkills, onTeach: SimulatePanelProps['onTeach']): WalkTeaching {
  const walkRow = skills.rows.find((r) => r.kit === 'velocity-tracking');
  const kit = skills.canKit('velocity-tracking');
  const teachWalk = kit ? () => void skills.trainKit('velocity-tracking') : onTeach && (() => onTeach('move'));

  return { velocityReady: skills.velocityReady, teachWalk, walkTraining: walkRow?.state.kind === 'training' };
}

function publishEntries(row: SkillRow, publish: ((row: SkillRow) => void) | null): ContextMenuEntry[] {
  if (!publish || row.state.kind !== 'ready') return [];

  return [{ label: 'Publish to Hugging Face', icon: <ShareIcon />, onSelect: () => publish(row) }];
}

export const SimulatePanel: React.FC<SimulatePanelProps> = (props) => {
  const { sim, training, cases, rig, parts, animations, policies, onSelectParts, onDeletePolicy } = props;
  const { skills, onTeach, share } = props;
  const walk = useWalkTeaching(skills, onTeach);
  const subject = watchSubject(skills, training);
  const margin = useTrainingWatch(sim, subject);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const skillActions = {
    onTrain: (row: SkillRow) =>
      row.kit || row.move ? void skills.train(row) : onTeach?.(row.record?.goal ?? row.label),
    onTry: (row: SkillRow) => void skills.tryRow(row),
    onDrive: () => void sim.drive.start(),
    onStop: skills.stop,
    onSnapshot: (row: SkillRow, ref: SnapshotRef) => void skills.playSnapshot(row, ref),
    onMenu: (e: React.MouseEvent, row: SkillRow) => {
      const items = [
        ...coachMenuItems(row, { coach: skills.coach, coaches: !!props.onCoach }),
        ...publishEntries(row, props.onPublishSkill),
      ];

      e.preventDefault();

      if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
    },
  };
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const on = sim.status !== 'off';
  const [policyKey, setPolicyKey] = useState<string | null>(null);
  const kase = cases.active;
  const openPolicyMenu = (e: React.MouseEvent, id: string) => {
    const policy = policies.find((p) => p.id === id);

    e.preventDefault();

    if (!policy) return;

    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Retrain', disabled: !training.canTrain, onSelect: () => void training.retrain(policy) },
        { divider: true },
        deleteEntry(() => onDeletePolicy(id)),
      ],
    });
  };
  const control = { sim, training, animations, policies, policyKey, setPolicyKey };
  const choose = useChooseController(control);

  return (
    <div className="flex flex-col h-full min-h-0">
      <SimControls sim={sim} on={on} />

      <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {kase && (
          <CaseSection
            cases={cases}
            check={props.caseCheck}
            onOpenCheck={props.onOpenCaseCheck}
            onRun={props.onRunCase}
            explore={props.explore}
          />
        )}
        {kase && (
          <TrySection
            cases={cases}
            teachWalk={withVelocity(sim.drive.offer, walk.velocityReady) === 'teach' ? walk.teachWalk : null}
            cls={sim.drive.cls}
          />
        )}
        <ControlSection {...control} choose={choose} showDrive={!kase} walk={walk} onToast={props.onToast} />
        <TrainSection
          skills={skills}
          actions={skillActions}
          margin={subject?.key.startsWith('skill:') ? margin : null}
          onTeach={onTeach}
          onCoach={props.onCoach}
          policies={policies}
          training={training}
          policyActions={{ onChoose: (id) => void choose(`policy:${id}`), onMenu: openPolicyMenu }}
        />
        <ResultsSection
          cases={cases}
          rig={rig}
          share={share}
          model={sim.model}
          parts={parts}
          world={sim.worldParts}
          compare={props.compare}
          explore={{ rows: props.explore, sceneName: props.sceneName }}
          run={
            on && sim.stats && sim.model
              ? { stats: sim.stats, model: sim.model, rig, onSelectParts, onFault: sim.setFault }
              : null
          }
        />
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
