import React from 'react';
import {
  Button,
  CloseIcon,
  IconButton,
  Kbd,
  PlusIcon,
  RunIcon,
  Section,
  StopIcon,
  TrainIcon,
} from '../../design-system';
import type { FitRow } from '../../cases/fitCheck';
import type { DriveClass } from '../../sim/driveKeys';
import type { Cases } from '../../workspace/useCases';
import { fmtTime } from './format';

const FIT_TONE: Record<FitRow['state'], string> = {
  pass: 'text-white/70',
  fail: 'text-[#f87171]',
  skip: 'text-white/50',
};

const FitRows: React.FC<{ cases: Cases; onNewCase: () => void }> = ({ cases, onNewCase }) => {
  const fit = cases.fit;

  if (!fit) return null;

  if (fit.checking) return <p className="mt-2 text-[13px] text-white/50">Checking</p>;

  const rows = fit.rows.filter((row) => row.state !== 'skip');
  const misfit = rows.some((row) => row.id === 'slot' && row.state === 'fail') && cases.builder.goals.length > 0;

  return (
    <div className="mt-2 flex flex-col" data-testid="robot-fit">
      {rows.map((row) => (
        <div key={row.id} className="min-h-8 py-1 flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-white/85 shrink-0">{row.label}</span>
          <span className={`text-right ${FIT_TONE[row.state]}`}>{row.detail}</span>
        </div>
      ))}
      {misfit && (
        <Button variant="secondary" size="sm" icon={<PlusIcon className="w-4 h-4" />} onClick={onNewCase}>
          New Case
        </Button>
      )}
    </div>
  );
};

export const CaseSection: React.FC<{ cases: Cases; onNewCase: () => void }> = ({ cases, onNewCase }) => {
  const kase = cases.active!;

  return (
    <Section
      title={kase.name}
      actions={
        <>
          <Button variant="ghost" size="sm" disabled={cases.fit?.checking} onClick={() => void cases.runFit()}>
            Check Fit
          </Button>
          <IconButton
            icon={<CloseIcon className="w-4 h-4" />}
            title="Close Case"
            size="xs"
            onClick={() => cases.open(null)}
          />
        </>
      }
    >
      <p className="text-[13px] leading-snug text-white/70" data-testid="case-brief">
        {kase.brief}
      </p>
      <FitRows cases={cases} onNewCase={onNewCase} />
    </Section>
  );
};

const KEYS: Record<DriveClass, Array<[string, string]>> = {
  arm: [
    ['Move', 'W A S D'],
    ['Raise and lower', 'Q E'],
  ],
  rover: [['Drive and turn', 'W A S D']],
  legs: [
    ['Walk and turn', 'W A S D'],
    ['Step sideways', 'Q E'],
  ],
};

export const DriveKeys: React.FC<{ cls: DriveClass }> = ({ cls }) => (
  <div className="flex flex-col">
    {[...KEYS[cls], ['Start over', 'R'] as [string, string], ['Stop driving', 'Esc'] as [string, string]].map(
      ([label, keys]) => (
        <div key={label} className="h-8 flex items-center justify-between text-[13px] text-white/70">
          <span>{label}</span>
          <span className="flex gap-1">
            {keys.split(' ').map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        </div>
      ),
    )}
  </div>
);

export const TrySection: React.FC<{ cases: Cases; teachWalk: (() => void) | null; cls: DriveClass | null }> = ({
  cases,
  teachWalk,
  cls,
}) => {
  const { attempt, active } = cases;
  const running = attempt.phase === 'running';

  return (
    <Section title="Try">
      <div className="flex flex-col gap-2">
        {running ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[13px] tabular text-white/80" data-testid="try-clock">
              {fmtTime(attempt.elapsed)} of {fmtTime(active?.task.seconds ?? 0)}
            </span>
            <Button variant="secondary" size="sm" icon={<StopIcon className="w-4 h-4" />} onClick={attempt.end}>
              End Try
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="md"
            fullWidth
            icon={<RunIcon className="w-4 h-4" />}
            disabled={attempt.phase !== 'idle'}
            onClick={() => void attempt.start()}
          >
            Try It
          </Button>
        )}
        {teachWalk && !running && (
          <Button variant="secondary" size="md" fullWidth icon={<TrainIcon className="w-4 h-4" />} onClick={teachWalk}>
            Teach It to Move
          </Button>
        )}
        {running && cls && <DriveKeys cls={cls} />}
      </div>
    </Section>
  );
};
