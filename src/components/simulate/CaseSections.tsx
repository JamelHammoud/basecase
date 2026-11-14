import React from 'react';
import {
  Button,
  CameraIcon,
  CloseIcon,
  ExpandIcon,
  IconButton,
  Kbd,
  RunIcon,
  Section,
  StopIcon,
  SwapIcon,
  TrainIcon,
} from '../../design-system';
import type { CaseCheck } from '../../readiness/caseChecks';
import type { DriveClass } from '../../sim/driveKeys';
import type { Cases } from '../../workspace/useCases';
import type { CaseExplore } from '../../workspace/useCaseExplore';
import { CheckIcon } from '../build/CheckIcon';
import { fmtTime } from './format';

interface CaseSectionProps {
  cases: Cases;
  check: CaseCheck | null;
  onOpenCheck: () => void;
  onRun: () => void;
  explore: CaseExplore;
}

const ExploreButton: React.FC<{ explore: CaseExplore }> = ({ explore }) => {
  if (explore.running)
    return <IconButton icon={<StopIcon className="w-4 h-4" />} title="Stop" size="xs" onClick={explore.stop} />;

  return explore.available ? (
    <IconButton icon={<SwapIcon className="w-4 h-4" />} title="Explore" size="xs" onClick={explore.start} />
  ) : null;
};

export const CaseSection: React.FC<CaseSectionProps> = ({ cases, check, onOpenCheck, onRun, explore }) => {
  const kase = cases.active!;

  return (
    <Section
      title={kase.name}
      actions={
        <>
          {check && (
            <IconButton
              icon={<CheckIcon status={check.status} />}
              title={check.text}
              size="xs"
              data-testid="case-check"
              data-status={check.status}
              onClick={onOpenCheck}
            />
          )}
          <ExploreButton explore={explore} />
          <IconButton icon={<ExpandIcon className="w-4 h-4" />} title="Run Case" size="xs" onClick={onRun} />
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
  pose: [],
};

export const DriveKeys: React.FC<{ cls: DriveClass }> = ({ cls }) => (
  <div className="flex flex-col">
    {[...KEYS[cls], ['Start over', 'R'] as [string, string]].map(([label, keys]) => (
      <div key={label} className="h-[28px] flex items-center justify-between text-[13px] text-white/70">
        <span>{label}</span>
        <span className="flex gap-1">
          {keys.split(' ').map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      </div>
    ))}
  </div>
);

export const TrySection: React.FC<{ cases: Cases; teachWalk: (() => void) | null; cls: DriveClass | null }> = ({
  cases,
  teachWalk,
  cls,
}) => {
  const { attempt, realTry, active } = cases;
  const live = realTry.phase === 'running' ? realTry : attempt;
  const running = live.phase === 'running';
  const busy = attempt.phase !== 'idle' || realTry.phase !== 'idle';

  return (
    <Section title="Try">
      <div className="flex flex-col gap-2">
        {running ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[13px] tabular text-white/80" data-testid="try-clock">
              {fmtTime(live.elapsed)} of {fmtTime(active?.task.seconds ?? 0)}
            </span>
            <Button variant="secondary" size="sm" icon={<StopIcon className="w-4 h-4" />} onClick={live.end}>
              Stop Try
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="md"
            fullWidth
            icon={<RunIcon className="w-4 h-4" />}
            disabled={busy}
            onClick={() => void attempt.start()}
          >
            Try It
          </Button>
        )}
        {cases.mat.available && !running && (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            icon={<CameraIcon className="w-4 h-4" />}
            disabled={busy}
            onClick={() => void realTry.start()}
          >
            Try on Real Robot
          </Button>
        )}
        {teachWalk && !running && (
          <Button variant="secondary" size="md" fullWidth icon={<TrainIcon className="w-4 h-4" />} onClick={teachWalk}>
            Teach It to Move
          </Button>
        )}
        {attempt.phase === 'running' && cls && <DriveKeys cls={cls} />}
      </div>
    </Section>
  );
};
