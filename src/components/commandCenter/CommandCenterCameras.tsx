import React from 'react';
import { LAYOUT, useScrollFade } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import type { ScenePart } from '../../types/robotics';
import type { FixedCameras } from '../../workspace/useFixedCameras';
import { CameraStrip } from '../cameras/CameraStrip';

interface CommandCenterCamerasProps {
  open: boolean;
  parts: ScenePart[];
  sim: Simulation;
  cameras: FixedCameras;
  patchPart: (id: string, patch: Partial<ScenePart>) => void;
}

const width = LAYOUT.commandCenterCameras;

export const CommandCenterCameras: React.FC<CommandCenterCamerasProps> = ({ open, ...strip }) => {
  const { ref, style } = useScrollFade();

  return (
    <aside
      aria-hidden={!open}
      className="relative h-full shrink-0 overflow-hidden transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: open ? width + LAYOUT.panelGap : 0 }}
    >
      <div
        data-testid="command-center-cameras"
        className="sidebar-surface h-full flex flex-col overflow-hidden rounded-[12px]"
        style={{ width }}
      >
        <div className="h-[44px] shrink-0 pl-[12px] pr-[8px] flex items-center">
          <h2 className="text-[15px] font-semibold text-white/90 tracking-[-0.01em]">Cameras</h2>
        </div>
        <div ref={ref} style={style} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {open && <CameraStrip {...strip} inCard />}
        </div>
      </div>
    </aside>
  );
};
