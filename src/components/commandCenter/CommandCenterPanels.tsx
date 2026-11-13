import React from 'react';
import type { CommandCenterLayout } from '../../cases/console';
import { LAYOUT, ModeHeader, useScrollFade } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import type { Cases } from '../../workspace/useCases';
import { BriefSection, TrySection } from '../simulate/CaseSections';
import { ResultsSection } from '../simulate/ResultsSection';
import { CommandCenterJoints } from './CommandCenterJoints';

export interface CommandCenterPanelsProps {
  open: boolean;
  width: number;
  column: CommandCenterLayout['column'];
  cases: Cases;
  sim: Simulation;
  parts: ScenePart[];
  failed: string[];
  joints: RobotJoint[];
  onBrowseRobots: () => void;
  onDone: () => void;
}

const panel = 'border-b border-white/[0.06] last:border-b-0';

function Panel({ name, props }: { name: CommandCenterLayout['column'][number]; props: CommandCenterPanelsProps }) {
  const { cases, sim, parts } = props;

  if (name === 'goal')
    return (
      <div data-testid="command-center-goal" className={panel}>
        <BriefSection cases={cases} failed={props.failed} />
      </div>
    );

  if (name === 'joints')
    return (
      <div data-testid="command-center-joints" className={panel}>
        <CommandCenterJoints joints={props.joints} onBrowseRobots={props.onBrowseRobots} />
      </div>
    );

  return (
    <div data-testid="command-center-tries" className={panel}>
      <TrySection cases={cases} teachWalk={null} cls={sim.drive.cls} />
      <ResultsSection cases={cases} model={sim.model} parts={parts} world={sim.worldParts} />
    </div>
  );
}

export const CommandCenterPanels: React.FC<CommandCenterPanelsProps> = (props) => {
  const { open, width, column, cases, onDone } = props;
  const { ref, style } = useScrollFade();

  return (
    <aside
      aria-hidden={!open}
      className="relative h-full shrink-0 overflow-hidden transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: open ? width + LAYOUT.panelGap : 0 }}
    >
      <div
        data-testid="command-center"
        className="h-full flex flex-col overflow-hidden bg-[#1f1f1f] rounded-[12px]"
        style={{ width, marginLeft: LAYOUT.panelGap }}
      >
        <ModeHeader title={cases.active?.name ?? ''} onDone={onDone} />
        <div ref={ref} style={style} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {column.map((name) => (
            <Panel key={name} name={name} props={props} />
          ))}
        </div>
      </div>
    </aside>
  );
};
