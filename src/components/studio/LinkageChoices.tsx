import React from 'react';
import type { LinkageSolution } from '../../utils/linkage';
import { THEME_COLORS } from '../../design-system';
import { PATH_MUTED } from './SketchPathLayer';

interface LinkageChoicesProps {
  solutions: LinkageSolution[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (solution: LinkageSolution) => void;
}

export const LinkageChoices: React.FC<LinkageChoicesProps> = ({ solutions, highlighted, onHighlight, onPick }) => (
  <div className="flex flex-col gap-0.5">
    {solutions.map((s, i) => (
      <button
        key={i}
        type="button"
        onPointerEnter={() => onHighlight(i)}
        onFocus={() => onHighlight(i)}
        onClick={() => onPick(s)}
        className="h-[32px] px-2.5 flex items-center gap-2.5 rounded-lg text-left text-[13px] tabular text-white/90 cursor-default hover:bg-white/[0.05] active:scale-[0.99] transition-[background-color,transform] duration-150"
      >
        <span
          className="w-4 h-0.5 rounded-full shrink-0"
          style={{ background: i === highlighted ? THEME_COLORS.figmaBlue : PATH_MUTED }}
        />
        {`${s.maxErrorMm.toFixed(1)} mm`}
      </button>
    ))}
  </div>
);
