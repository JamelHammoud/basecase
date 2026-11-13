import React from 'react';
import { Button, IconButton, RunIcon, StopIcon, TrainIcon } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import { snapshotRefs, type SnapshotRef } from '../../skills/snapshots';
import { fmtMargin, pct } from './format';
import { ProgressBar } from './ProgressBar';

export interface SkillActions {
  onTrain: (row: SkillRow) => void;
  onTry: (row: SkillRow) => void;
  onDrive: () => void;
  onStop: () => void;
  onSnapshot?: (row: SkillRow, ref: SnapshotRef) => void;
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

const watchedMargin = (row: SkillRow, margin: number | null) =>
  row.state.kind === 'training' && !row.state.background ? margin : null;

const SnapshotList: React.FC<{ row: SkillRow; actions: SkillActions }> = ({ row, actions }) => {
  const { onSnapshot } = actions;
  const refs = row.state.kind === 'ready' ? snapshotRefs(row.record?.snapshots) : [];

  if (!refs.length || !onSnapshot) return null;

  return (
    <div className="flex flex-wrap gap-1 pt-1" data-testid="snapshots">
      {refs.map((ref) => (
        <Button
          key={`${ref.run}-${ref.iteration}`}
          variant="ghost"
          size="xs"
          className="tabular"
          onClick={() => onSnapshot(row, ref)}
          data-testid="snapshot"
        >
          {ref.iteration}
        </Button>
      ))}
    </div>
  );
};

export const SkillsList: React.FC<{ rows: SkillRow[]; actions: SkillActions; margin?: number | null }> = ({
  rows,
  actions,
  margin = null,
}) => (
  <ul className="flex flex-col gap-1" data-testid="skills-list">
    {rows.map((row) => {
      const line = stateLine(row);
      const shown = watchedMargin(row, margin);

      return (
        <li key={row.target} className="flex flex-col" data-testid="skill-row">
          <div className="flex items-center gap-2 min-h-9">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-white/85 truncate">{row.label}</div>
              {line && <div className="text-[12px] text-white/50 tabular truncate">{line}</div>}
              {row.state.kind === 'training' && row.state.share !== null && <ProgressBar share={row.state.share} />}
            </div>
            {shown !== null && (
              <span className="text-[12px] text-white/60 tabular" data-testid="watch-margin">
                {fmtMargin(shown)}
              </span>
            )}
            <RowAction row={row} actions={actions} />
          </div>
          <SnapshotList row={row} actions={actions} />
        </li>
      );
    })}
  </ul>
);
