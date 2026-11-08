import React, { useState } from 'react';
import { ContextMenu, ContextMenuEntry, useScrollFade } from '../design-system';
import type { PolicyRecord, RobotAnimation, ScenePart } from '../types/robotics';
import type { Simulation } from '../sim/useSimulation';
import type { Training } from '../sim/useTraining';
import type { Rig } from '../utils/kinematics';
import type { Cases } from '../workspace/useCases';
import { BriefSection, RobotFitSection, TrySection } from './simulate/CaseSections';
import { ControlSection, useChooseController } from './simulate/ControlSection';
import { EmulatedRobotSection } from './simulate/EmulatedRobotSection';
import { ModelSection } from './simulate/ModelSection';
import { PoliciesSection } from './simulate/PoliciesSection';
import { ResultSection } from './simulate/ResultSection';
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
}

export const SimulatePanel: React.FC<SimulatePanelProps> = (props) => {
  const { sim, training, cases, rig, parts, animations, policies, onSelectParts, onDeletePolicy, onNewCase } = props;
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const on = sim.status !== 'off';
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [policyKey, setPolicyKey] = useState<string | null>(null);
  const kase = cases.active;
  const openPolicyMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Delete', tone: 'danger', onSelect: () => onDeletePolicy(id) }],
    });
  };
  const control = { sim, training, animations, policies, policyKey, setPolicyKey };
  const choose = useChooseController(control);

  return (
    <div className="flex flex-col h-full min-h-0">
      <SimControls sim={sim} on={on} />

      <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {kase && <BriefSection cases={cases} />}
        {kase && <RobotFitSection cases={cases} onNewCase={onNewCase} />}
        {kase && <TrySection cases={cases} driveNote={sim.drive.note} cls={sim.drive.cls} />}
        <EmulatedRobotSection />
        <ControlSection {...control} choose={choose} showDrive={!kase} />
        <TrainSection training={training} fixed={cases.fixedBase} />
        {kase && <ResultsSection cases={cases} model={sim.model} parts={parts} world={sim.worldParts} />}

        {on && sim.stats && sim.model && (
          <ResultSection stats={sim.stats} model={sim.model} rig={rig} onSelectParts={onSelectParts} />
        )}
        {sim.model && <ModelSection model={sim.model} version={sim.version} />}
        {policies.length > 0 && (
          <PoliciesSection
            policies={policies}
            onChoose={(id) => void choose(`policy:${id}`)}
            onDelete={onDeletePolicy}
            onMenu={openPolicyMenu}
          />
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
