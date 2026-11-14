import React from 'react';
import { TracePlot } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { useJointReplay } from './useJointReplay';
import { angleFromRadians } from '../../utils/angle';

interface JointReplayPlotProps {
  history: CalibrationHistory;
  version: number | null;
}

export const JointReplayPlot: React.FC<JointReplayPlotProps> = ({ history, version }) => {
  const replay = useJointReplay(history, version);

  if (replay === null) return null;

  const traces = replay
    ? [
        { id: 'logged', values: replay.logged, tone: 'primary' as const },
        { id: 'preset', values: replay.preset.positionRad, tone: 'muted' as const },
        ...(replay.calibration
          ? [{ id: 'calibration', values: replay.calibration.positionRad, tone: 'accent' as const }]
          : []),
      ]
    : [];

  return (
    <div className="px-1 pt-1 pb-2" data-testid="joint-replay" data-version={replay?.version ?? 0}>
      <TracePlot traces={traces} loading={!replay} />
      {replay && (
        <div className="mt-2 flex items-baseline gap-[12px] text-[13px] tabular-nums">
          {replay.preset.medianErrorRad !== null && (
            <span
              className="text-white/50"
              data-testid="replay-error-preset"
              data-error-rad={replay.preset.medianErrorRad}
            >
              {angleFromRadians(replay.preset.medianErrorRad)}
            </span>
          )}
          {replay.calibration?.medianErrorRad != null && (
            <span
              className="text-figma-blue"
              data-testid="replay-error-calibration"
              data-error-rad={replay.calibration.medianErrorRad}
            >
              {angleFromRadians(replay.calibration.medianErrorRad)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
