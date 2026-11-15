import React, { useState } from 'react';
import { ContextMenu, ContextMenuEntry, deleteEntry, DownloadIcon, ShareIcon, useScrollFade } from '../design-system';
import type { PolicyRecord, RobotAnimation, ScenePart } from '../types/robotics';
import { withVelocity } from '../sim/driveAccess';
import type { Simulation } from '../sim/useSimulation';
import type { SkillRow } from '../skills/skillRows';
import type { SnapshotRef } from '../skills/snapshots';
import type { StressAxisResult } from '../skills/stress';
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
import type { Study } from '../workspace/useStudy';
import { StudySection } from './simulate/StudySection';
import { SimControls } from './simulate/SimControls';
import { TrainSection, type CoachSend } from './simulate/TrainSection';
import { coachMenuItems, rollOutMenuItems, stressMenuItems, type RollOutMenu } from './simulate/skillMenu';

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
  study: Study;
  sceneName: string;
  onToast: (message: string) => void;
  onPublishSkill: ((row: SkillRow) => void) | null;
  onInstallSkill: (() => void) | null;
  fleet: RollOutMenu;
}

const toastProblem = (started: Promise<string | null>, onToast: (message: string) => void) =>
  void started.then((problem) => problem && onToast(problem));

function useWalkTeaching(
  skills: SceneSkills,
  { onTeach, onToast }: Pick<SimulatePanelProps, 'onTeach' | 'onToast'>,
): WalkTeaching {
  const walkRow = skills.rows.find((r) => r.kit === 'velocity-tracking');
  const kit = skills.canKit('velocity-tracking');
  const teachWalk = kit
    ? () => toastProblem(skills.trainKit('velocity-tracking'), onToast)
    : onTeach && (() => onTeach('move'));

  return { velocityReady: skills.velocityReady, teachWalk, walkTraining: walkRow?.state.kind === 'training' };
}

function publishEntries(row: SkillRow, publish: ((row: SkillRow) => void) | null): ContextMenuEntry[] {
  if (!publish || row.state.kind !== 'ready') return [];

  return [{ label: 'Publish to Hugging Face', icon: <ShareIcon />, onSelect: () => publish(row) }];
}

export const SimulatePanel: React.FC<SimulatePanelProps> = (props) => {
  const { sim, training, cases, rig, parts, animations, policies, onSelectParts, onDeletePolicy } = props;
  const { skills, onTeach, share } = props;
  const walk = useWalkTeaching(skills, props);
  const subject = watchSubject(skills, training);
  const margin = useTrainingWatch(sim, subject);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const skillActions = {
    onTrain: (row: SkillRow) =>
      row.kit || row.move ? toastProblem(skills.train(row), props.onToast) : onTeach?.(row.record?.goal ?? row.label),
    onTry: (row: SkillRow) => void skills.tryRow(row),
    onDrive: () => void sim.drive.start(),
    onStop: skills.stop,
    onSnapshot: (row: SkillRow, ref: SnapshotRef) => void skills.playSnapshot(row, ref),
    onFinding: (row: SkillRow, finding: StressAxisResult) => void skills.stress.replay(row, finding),
    onMenu: (e: React.MouseEvent, row: SkillRow) => {
      const items = [
        ...stressMenuItems(row, {
          onStress: (r) => toastProblem(skills.stress.run(r), props.onToast),
          onTrain: (r) => toastProblem(skills.stress.train(r), props.onToast),
        }),
        ...coachMenuItems(row, { coach: skills.coach, coaches: !!props.onCoach }),
        ...publishEntries(row, props.onPublishSkill),
        ...(props.onInstallSkill
          ? [{ label: 'Install Skill', icon: <DownloadIcon />, onSelect: props.onInstallSkill }]
          : []),
        ...rollOutMenuItems(row, props.fleet),
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
            study={props.study}
          />
        )}
        {kase && (
          <TrySection
            cases={cases}
            teachWalk={withVelocity(sim.drive.offer, walk.velocityReady) === 'teach' ? walk.teachWalk : null}
            cls={sim.drive.cls}
          />
        )}
        <StudySection study={props.study} />
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
