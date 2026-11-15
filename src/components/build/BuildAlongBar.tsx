import React from 'react';
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  FloatingIsland,
  IconButton,
  IslandDivider,
  Spinner,
} from '../../design-system';
import type { BuildAlong } from '../../workspace/useBuildAlong';
import { useBuildAlongKeys } from '../../workspace/useBuildAlongKeys';
import { BuildAlongItems } from './BuildAlongItems';

interface BuildAlongBarProps {
  buildAlong: BuildAlong;
  active: boolean;
  ready: boolean[];
  onPrint: (id: string) => void;
}

export const BuildAlongBar: React.FC<BuildAlongBarProps> = ({ buildAlong, active, ready, onPrint }) => {
  const { step, index, count, opening, progress } = buildAlong;
  const partsReady = !!step && step.repairPhase !== 'remove' && ready[index];

  useBuildAlongKeys(buildAlong, active && buildAlong.active);

  if (!buildAlong.active || !active) return null;

  return (
    <div className="absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-2 px-6 pointer-events-none">
      <FloatingIsland
        role="toolbar"
        aria-label="Build Along"
        data-step={step ? index + 1 : undefined}
        data-ready={partsReady || undefined}
        className="pointer-events-auto h-[40px]"
      >
        {opening ? (
          <div className="flex items-center gap-2 px-[8px] text-[12.5px] text-white/60 whitespace-nowrap">
            <Spinner className="w-4 h-4" />
            {progress && `${progress.label}…`}
          </div>
        ) : (
          <>
            <IconButton
              size="sm"
              title="Previous step"
              shortcut="←"
              tooltipSide="bottom"
              disabled={index <= 0}
              icon={<ChevronLeftIcon className="w-4 h-4" />}
              onClick={buildAlong.previous}
            />
            <div className="flex items-center justify-center gap-1.5 text-[12.5px] text-white/60 tabular-nums whitespace-nowrap px-[6px] min-w-[64px]">
              {index + 1} of {count}
              {partsReady && <CircleCheckIcon className="w-4 h-4 text-emerald-400" />}
            </div>
            <IconButton
              size="sm"
              title="Next step"
              shortcut="→"
              tooltipSide="bottom"
              disabled={index >= count - 1}
              icon={<ChevronRightIcon className="w-4 h-4" />}
              onClick={buildAlong.next}
            />
          </>
        )}
        {step?.printPartId && (
          <Button size="sm" variant="ghost" onClick={() => onPrint(step.printPartId!)} title="Print" tooltipSide="bottom">
            Print
          </Button>
        )}
        <IslandDivider />
        <Button size="sm" variant="ghost" onClick={buildAlong.close} title="Done" shortcut="Esc" tooltipSide="bottom">
          Done
        </Button>
      </FloatingIsland>
      <BuildAlongItems step={step} />
    </div>
  );
};
