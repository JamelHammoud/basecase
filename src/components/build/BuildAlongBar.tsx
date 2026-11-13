import React from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FloatingIsland,
  IconButton,
  IslandDivider,
  Spinner,
} from '../../design-system';
import type { BuildAlong } from '../../workspace/useBuildAlong';
import { useBuildAlongKeys } from '../../workspace/useBuildAlongKeys';

const chip = 'glass rounded-full h-8 px-3.5 flex items-center text-[13px] text-white/85 tabular-nums whitespace-nowrap';

export const BuildAlongBar: React.FC<{ buildAlong: BuildAlong; active: boolean }> = ({ buildAlong, active }) => {
  const { step, index, count, opening, progress } = buildAlong;

  useBuildAlongKeys(buildAlong, active && buildAlong.active);

  if (!buildAlong.active) return null;

  return (
    <div className="absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-2 px-6 pointer-events-none">
      <FloatingIsland
        role="toolbar"
        aria-label="Build Along"
        data-step={step ? index + 1 : undefined}
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
            <div className="text-[12.5px] text-white/60 tabular-nums whitespace-nowrap px-[6px] min-w-[64px] text-center">
              {index + 1} of {count}
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
        <IslandDivider />
        <IconButton
          size="sm"
          title="Close"
          shortcut="Esc"
          tooltipSide="bottom"
          icon={<CloseIcon className="w-4 h-4" />}
          onClick={buildAlong.close}
        />
      </FloatingIsland>
      {!!step?.callout.length && (
        <ul className="flex flex-wrap justify-center gap-2 max-w-[720px]">
          {step.callout.map((c) => (
            <li key={`${c.qty}|${c.name}`} className={chip}>
              {c.qty} × {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
