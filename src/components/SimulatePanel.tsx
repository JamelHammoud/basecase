import React, { useState } from 'react';
import { useScrollFade } from '../design-system';
import type { PolicyRecord, RobotAnimation, ScenePart } from '../types/robotics';
import { withVelocity } from '../sim/driveAccess';
import type { Simulation } from '../sim/useSimulation';
import type { SkillRow } from '../skills/skillRows';
import type { Training } from '../sim/useTraining';
import type { Rig } from '../utils/kinematics';
import type { Cases } from '../workspace/useCases';
import type { SceneSkills } from '../workspace/useSkills';
import { CaseSection, TrySection } from './simulate/CaseSections';
import { ControlSection, useChooseController, type WalkTeaching } from './simulate/ControlSection';
import { ResultsSection } from './simulate/ResultsSection';
import { SimControls } from './simulate/SimControls';
import { TrainSection } from './simulate/TrainSection';

interface SimulatePanelProps {
  sim: Simulation;
  training: Training;
  cases: Cases;
  rig: Rig;
  parts: ScenePart[];
  animations: RobotAnimation[];
  policies: PolicyRecord[];
  onSelectParts: (ids: string[]) => void;
  onDeletePolicy: (id: string) => void;
  onNewCase: () => void;
  skills: SceneSkills;
  onTeach: ((goal: string) => void) | null;
}

function useWalkTeaching(skills: SceneSkills, onTeach: SimulatePanelProps['onTeach']): WalkTeaching {
  const walkRow = skills.rows.find((r) => r.kit === 'velocity-tracking');
  const kit = skills.canKit('velocity-tracking');
  const teachWalk = kit ? () => void skills.trainKit('velocity-tracking') : onTeach && (() => onTeach('move'));

  return { velocityReady: skills.velocityReady, teachWalk, walkTraining: walkRow?.state.kind === 'training' };
}

export const SimulatePanel: React.FC<SimulatePanelProps> = (props) => {
  const { sim, training, cases, rig, parts, animations, policies, onSelectParts, onDeletePolicy, onNewCase } = props;
  const { skills, onTeach } = props;
  const walk = useWalkTeaching(skills, onTeach);
  const skillActions = {
    onTrain: (row: SkillRow) => (row.kit ? void skills.train(row) : onTeach?.(row.record?.goal ?? row.label)),
    onTry: (row: SkillRow) => void skills.tryRow(row),
    onDrive: () => void sim.drive.start(),
    onStop: skills.stop,
  };
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const [policyKey, setPolicyKey] = useState<string | null>(null);
  const kase = cases.active;
  const control = { sim, training, animations, policies, policyKey, setPolicyKey };
  const choose = useChooseController(control);
  const trained = {
    policies,
    training,
    onChoose: (id: string) => void choose(`policy:${id}`),
    onDelete: onDeletePolicy,
  };

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="simulate-panel">
      <SimControls sim={sim} on={sim.status !== 'off'} />

      <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {kase && <CaseSection cases={cases} onNewCase={onNewCase} />}
        {kase && (
          <TrySection
            cases={cases}
            teachWalk={withVelocity(sim.drive.offer, walk.velocityReady) === 'teach' ? walk.teachWalk : null}
            cls={sim.drive.cls}
          />
        )}
        <ControlSection {...control} choose={choose} showDrive={!kase} walk={walk} />
        <TrainSection skills={skills} actions={skillActions} onTeach={onTeach} trained={trained} />
        <ResultsSection cases={cases} sim={sim} rig={rig} parts={parts} onSelectParts={onSelectParts} />
      </div>
    </div>
  );
};
