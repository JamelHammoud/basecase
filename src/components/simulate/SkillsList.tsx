import React from 'react';
import { Button, IconButton, RefreshIcon, RunIcon, StopIcon, TrainIcon } from '../../design-system';
import { signalFigure, signalNumber } from '../../skills/coachSignals';
import type { CoachTag } from '../../skills/skillRecords';
import type { SkillRow } from '../../skills/skillRows';
import { snapshotRefs, type SnapshotRef } from '../../skills/snapshots';
import { fmtMargin, trainingLine } from './format';
import { ProgressBar } from './ProgressBar';

export interface SkillActions {
  onTrain: (row: SkillRow) => void;
  onTry: (row: SkillRow) => void;
  onDrive: () => void;
  onStop: () => void;
  onSnapshot?: (row: SkillRow, ref: SnapshotRef) => void;
  onMenu?: (e: React.MouseEvent, row: SkillRow) => void;
}

const coachedLine = (tag: CoachTag) =>
  `${signalFigure(tag.signal, tag.before)} → ${signalNumber(tag.signal, tag.after)}`;

function stateLines(row: SkillRow): string[] {
  const { state } = row;
  const tag = row.record?.coach;

  if (state.kind === 'ready') return tag ? [state.arena, coachedLine(tag)] : [state.arena];

  if (state.kind === 'untrained') return state.refused ? [state.refused] : [];

  if (state.kind !== 'training') return [];

  return [trainingLine(state.message, state.share)];
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

  const recheck = state.kind === 'recheck';
  const ActionIcon = recheck ? RefreshIcon : TrainIcon;

  return (
    <Button
      variant="secondary"
      size="xs"
      icon={<ActionIcon className="w-3.5 h-3.5" />}
      onClick={() => actions.onTrain(row)}
    >
      {recheck ? 'Recheck' : 'Train'}
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
      const lines = stateLines(row);
      const shown = watchedMargin(row, margin);

      return (
        <li
          key={row.target}
          className="flex flex-col"
          data-testid="skill-row"
          data-skill={row.record?.hash}
          onContextMenu={actions.onMenu && ((e) => actions.onMenu?.(e, row))}
        >
          <div className="flex items-center gap-2 min-h-[32px]">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-white/85 truncate">{row.label}</div>
              {lines.map((line) => (
                <div key={line} className="text-[12px] text-white/50 tabular truncate">
                  {line}
                </div>
              ))}
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
