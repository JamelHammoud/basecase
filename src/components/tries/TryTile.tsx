import React, { useRef } from 'react';
import { Badge } from '../../design-system';
import { TRY_SOURCE_BADGE, summaryRecord, type TrySummary } from '../../cases/tryFile';
import type { SimModel } from '../../sim/mjcfTypes';
import type { ScenePart } from '../../types/robotics';
import { runClock } from '../../utils/duration';
import type { PickKeys } from '../../workspace/useTriesView';
import { useFilmstrip } from '../simulate/useFilmstrip';
import { useSeen } from './useSeen';
import { useStoredStrip } from './useStoredStrip';

const OUTCOME: Record<TrySummary['outcome']['verdict'], string | null> = {
  passed: 'Passed',
  failed: 'Missed',
  unjudged: null,
};

export interface TileScene {
  model: SimModel | null;
  parts: ScenePart[];
  world: ScenePart[];
}

const NONE: ScenePart[] = [];

export interface TileLabel {
  title: string;
  span: string;
  verdict: TrySummary['outcome']['verdict'];
}

const labelOf = (summary: TrySummary): TileLabel => ({
  title: summary.caseName ?? '',
  span: runClock(summary.seconds),
  verdict: summary.outcome.verdict,
});

const TileCaption: React.FC<{ label: TileLabel; badge: string | null }> = ({ label, badge }) => {
  const outcome = OUTCOME[label.verdict];

  return (
    <div className="px-0.5 min-w-0">
      <div className="text-[13px] font-medium text-white/90 truncate">{label.title}</div>
      <div className="flex items-center gap-2 text-[12.5px]">
        {outcome && <span className={label.verdict === 'passed' ? 'text-white/90' : 'text-red-400'}>{outcome}</span>}
        <span className="text-white/50 tabular">{label.span}</span>
        {badge && <Badge>{badge}</Badge>}
      </div>
    </div>
  );
};

interface TryTileProps {
  summary: TrySummary;
  label?: TileLabel;
  scene: TileScene | null;
  selected: boolean;
  onPick: (keys: PickKeys) => void;
  onMenu: (e: React.MouseEvent) => void;
}

export const TryTile: React.FC<TryTileProps> = ({ summary, label, scene, selected, onPick, onMenu }) => {
  const tile = useRef<HTMLButtonElement | null>(null);
  const seen = useSeen(tile);
  const drawn = useFilmstrip(
    summaryRecord(summary),
    seen && scene && !summary.strip ? scene.model : null,
    scene?.parts ?? NONE,
    scene?.world ?? NONE,
  );
  const film = useStoredStrip(summary.id, seen && summary.strip) ?? drawn;

  return (
    <button
      ref={tile}
      type="button"
      data-testid="try-tile"
      data-try={summary.id}
      aria-pressed={selected}
      onClick={(e) => onPick({ shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey })}
      onContextMenu={onMenu}
      className={`min-w-0 p-1.5 rounded-[10px] text-left cursor-default flex flex-col gap-1.5 transition-colors ${
        selected ? 'bg-[#0d99ff]/15 ring-[1.5px] ring-inset ring-[#0d99ff]/70' : 'hover:bg-white/[0.05]'
      }`}
    >
      <div className="h-14 rounded-[6px] bg-white/[0.04] overflow-hidden">
        {film && <img src={film} alt="" className="w-full h-full object-cover" draggable={false} />}
      </div>
      <TileCaption label={label ?? labelOf(summary)} badge={TRY_SOURCE_BADGE[summary.source]} />
    </button>
  );
};
