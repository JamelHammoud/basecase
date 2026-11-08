import React from 'react';
import { Button, IconButton, RunIcon, StopIcon, TrainIcon } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import { pct } from './format';

export interface SkillActions {
  onTrain: (row: SkillRow) => void;
  onTry: (row: SkillRow) => void;
  onDrive: () => void;
  onStop: () => void;
}

function stateLine(row: SkillRow): string | null {
  const { state } = row;

  if (state.kind === 'ready') return state.arena;

  if (state.kind !== 'training') return null;

  return state.share === null ? state.message : `${state.message} ${pct(state.share)}`;
}

const RowAction: React.FC<{ row: SkillRow; actions: SkillActions }> = ({ row, actions }) => {
  const { state } = row;

  if (state.kind === 'training')
    return state.background ? null : (
      <IconButton
        icon={<StopIcon className="w-3.5 h-3.5" />}
        title="Stop training"
        size="xs"
        onClick={actions.onStop}
      />
    );

  if (state.kind === 'ready')
    return (
      <Button
        variant="secondary"
        size="xs"
        icon={<RunIcon className="w-3.5 h-3.5" />}
        onClick={() => (row.drives ? actions.onDrive() : actions.onTry(row))}
      >
        {row.drives ? 'Drive' : 'Try'}
      </Button>
    );

  return (
    <Button
      variant="secondary"
      size="xs"
      icon={<TrainIcon className="w-3.5 h-3.5" />}
      onClick={() => actions.onTrain(row)}
    >
      {state.kind === 'recheck' ? 'Recheck' : 'Train'}
    </Button>
  );
};

const Progress: React.FC<{ share: number }> = ({ share }) => (
  <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
    <div
      className="h-full bg-[#0d99ff] transition-[width] duration-300"
      style={{ width: `${Math.round(Math.min(1, share) * 100)}%` }}
    />
  </div>
);

export const SkillsList: React.FC<{ rows: SkillRow[]; actions: SkillActions }> = ({ rows, actions }) => (
  <ul className="flex flex-col gap-1" data-testid="skills-list">
    {rows.map((row) => {
      const line = stateLine(row);

      return (
        <li key={row.target} className="flex items-center gap-2 min-h-9" data-testid="skill-row">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-white/85 truncate">{row.label}</div>
            {line && <div className="text-[12px] text-white/45 tabular truncate">{line}</div>}
            {row.state.kind === 'training' && row.state.share !== null && <Progress share={row.state.share} />}
          </div>
          <RowAction row={row} actions={actions} />
        </li>
      );
    })}
  </ul>
);
