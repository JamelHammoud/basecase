import { BuildPhotoImport } from './BuildPhotoImport';
import { BuildCompletion } from './BuildCompletion';
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
import { CradleBarActions } from './CradleBarActions';
import type { AssemblyCradle } from '../../workspace/useAssemblyCradle';

interface BuildAlongBarProps {
  cradle?: AssemblyCradle;
  buildAlong: BuildAlong;
  active: boolean;
  ready: boolean[];
  onPrint: (id: string) => void;
}

const barPlacement = (buildAlong: BuildAlong) =>
  buildAlong.frozen ? 'relative shrink-0 py-[12px]' : 'absolute inset-x-0 top-3';

export const BuildAlongBar: React.FC<BuildAlongBarProps> = ({ buildAlong, active, ready, onPrint, cradle }) => {
  const { step, index, count, opening, progress } = buildAlong;
  const partsReady = !!step && step.repairPhase !== 'remove' && ready[index];

  useBuildAlongKeys(buildAlong, active && buildAlong.active);

  if (!buildAlong.active || !active) return null;

  return (
    <div
      className={`${barPlacement(buildAlong)} z-20 flex flex-col items-center gap-2 px-[12px] pointer-events-none`}
      data-build-along-bar
    >
      <FloatingIsland
        role="toolbar"
        aria-label="Build Along"
        data-step={step ? index + 1 : undefined}
        data-ready={partsReady || undefined}
        className="pointer-events-auto min-h-[40px] max-w-full flex-wrap justify-center [&>button]:shrink-0"
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
              disabled={index <= 0 || buildAlong.saving}
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
              disabled={index >= count - 1 || buildAlong.saving}
              icon={<ChevronRightIcon className="w-4 h-4" />}
              onClick={buildAlong.next}
            />
          </>
        )}
        {step?.printPartId && (
          <Button size="sm" variant="ghost" onClick={() => onPrint(step.printPartId!)}>
            Print
          </Button>
        )}
        <BuildCompletion buildAlong={buildAlong} />
        <BuildPhotoImport buildAlong={buildAlong} />

        <CradleBarActions cradle={cradle} />
        <IslandDivider />
        <Button size="sm" variant="ghost" onClick={buildAlong.close} shortcut="Esc" tooltipSide="bottom">
          Done
        </Button>
      </FloatingIsland>
      <BuildAlongItems step={step} />
    </div>
  );
};
