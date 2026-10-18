import React, { useState } from 'react';
import { Button, ContextMenu, ContextMenuEntry, Section, Select, useScrollFade } from '../design-system';
import { Hand } from 'lucide-react';
import type { PolicyRecord, RobotAnimation } from '../types/robotics';
import type { Simulation } from '../sim/useSimulation';
import type { Training } from '../sim/useTraining';
import type { Rig } from '../utils/kinematics';
import { controllerValue } from './simulate/format';
import { ModelSection } from './simulate/ModelSection';
import { PoliciesSection } from './simulate/PoliciesSection';
import { ResultSection } from './simulate/ResultSection';
import { SimControls } from './simulate/SimControls';
import { TrainSection } from './simulate/TrainSection';

interface SimulatePanelProps {
  sim: Simulation;
  training: Training;
  rig: Rig;
  animations: RobotAnimation[];
  policies: PolicyRecord[];
  onSelectParts: (ids: string[]) => void;
  onDeletePolicy: (id: string) => void;
}

export const SimulatePanel: React.FC<SimulatePanelProps> = ({
  sim,
  training,
  rig,
  animations,
  policies,
  onSelectParts,
  onDeletePolicy,
}) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const on = sim.status !== 'off';
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [policyKey, setPolicyKey] = useState<string | null>(null);
  const current = controllerValue(sim.controller, policyKey);
  const options = [
    { value: 'hold', label: 'Hold pose' },
    ...animations.map((a) => ({ value: `anim:${a.id}`, label: a.name })),
    ...policies.map((p) => ({ value: `policy:${p.id}`, label: p.name })),
    { value: 'limp', label: 'Limp' },
  ];
  const chooseLocal = (value: string) => {
    if (value === 'hold' || value === 'limp') {
      setPolicyKey(null);
      sim.setController({ kind: value });

      return;
    }

    if (!value.startsWith('anim:')) return;

    const a = animations.find((x) => `anim:${x.id}` === value);

    setPolicyKey(null);

    if (a) sim.setController({ kind: 'animation', animation: a });
  };
  const choosePolicy = async (id: string) => {
    const rec = policies.find((p) => p.id === id);
    const spec = rec ? await training.loadPolicy(id) : null;

    if (!rec || !spec) return;

    setPolicyKey(id);
    sim.setController({ kind: 'policy', policy: spec, robot: rec.robot });
  };
  const choose = async (value: string) => {
    if (value.startsWith('policy:')) await choosePolicy(value.slice(7));
    else chooseLocal(value);

    if (on) sim.reset();
  };
  const openPolicyMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Delete', tone: 'danger', onSelect: () => onDeletePolicy(id) }],
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <SimControls sim={sim} on={on} />

      <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <Section title="Control">
          <div className="flex items-center gap-2">
            <Select
              aria-label="Controller"
              value={current}
              options={options}
              onChange={(e) => void choose(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Hand className="w-4 h-4" />}
              disabled={!sim.playing}
              title="Push the robot sideways"
              onClick={() => sim.push()}
            >
              Push
            </Button>
          </div>
        </Section>

        {on && sim.stats && sim.model && (
          <ResultSection stats={sim.stats} model={sim.model} rig={rig} onSelectParts={onSelectParts} />
        )}

        {sim.model && <ModelSection model={sim.model} version={sim.version} />}

        <TrainSection training={training} />

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
