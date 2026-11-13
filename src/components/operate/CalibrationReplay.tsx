import React from 'react';
import { TRACE_COLORS, TracePlot, type Trace } from '../../design-system';
import { errorDegrees } from '../../reality/benchReplay';
import type { CalibrationHistory } from '../../reality/history';
import { useJointReplay } from './useJointReplay';

interface CalibrationReplayProps {
  history: CalibrationHistory;
  version: number | null;
}

export const CalibrationReplay: React.FC<CalibrationReplayProps> = ({ history, version }) => {
  const { chosen, logged, preset, calibrated } = useJointReplay(history, version);
  const traces: Trace[] = [
    { id: 'logged', values: logged.positionRad, tone: 'strong' },
    ...(preset ? [{ id: 'preset', values: preset.positionRad, tone: 'muted' as const }] : []),
    ...(calibrated ? [{ id: 'calibrated', values: calibrated.positionRad, tone: 'accent' as const }] : []),
  ];

  return (
    <div
      data-testid="calibration-replay"
      data-version={chosen?.version ?? 0}
      data-ready={Boolean(preset) || undefined}
      className="mt-[2px] mb-2"
    >
      <TracePlot times={logged.seconds} traces={traces} />
      <div className="h-8 px-1 flex items-center justify-end gap-[12px] text-[13px] tabular-nums">
        {preset && (
          <span data-testid="replay-error-preset" className="text-white/50">
            {errorDegrees(preset.medianErrorRad)}
          </span>
        )}
        {calibrated && (
          <span data-testid="replay-error-calibrated" style={{ color: TRACE_COLORS.accent }}>
            {errorDegrees(calibrated.medianErrorRad)}
          </span>
        )}
      </div>
    </div>
  );
};
