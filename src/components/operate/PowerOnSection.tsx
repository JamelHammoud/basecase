import React, { useEffect } from 'react';
import { Button } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { canCheckPower, describeFinding, resetPowerOn, skipPowerOnStep, usePowerOn } from '../../robot/powerOn';
import { isFixable } from '../../robot/powerOnCheck';
import type { RobotState } from '../../robot/robotState';
import type { RobotJoint } from '../../types/robotics';

const CURRENT_ROW = 'bg-[color-mix(in_srgb,#0d99ff_18%,var(--color-panel-bg))]';
const ROW = 'min-h-[32px] px-1 py-1 flex items-center justify-between gap-3 rounded-lg text-[13px]';

export interface PowerOnProps {
  onCheck: () => void;
  onFix: () => void;
}

interface PowerOnSectionProps extends PowerOnProps {
  robot: RobotState;
  joints: RobotJoint[];
  calibrations: Record<string, CalibrationHistory> | undefined;
}

export const PowerOnSection: React.FC<PowerOnSectionProps> = ({ robot, joints, calibrations, onCheck, onFix }) => {
  const power = usePowerOn();
  const live = robot.link === 'connected';
  const { step, findings, refusal, outcome } = power;

  useEffect(() => {
    if (!live) resetPowerOn();
  }, [live]);

  if (!live) return null;

  if (power.running || power.replaying)
    return (
      <div className="mb-3" data-testid="power-on" data-power-on={power.replaying ? 'replaying' : 'running'}>
        {step && (
          <div data-joint={step.jointId} className={`${ROW} ${CURRENT_ROW}`}>
            <span className="min-w-0 truncate text-white">{step.name}</span>
            <span className="shrink-0 tabular-nums text-white/90">{step.id}</span>
            <Button variant="ghost" onClick={skipPowerOnStep}>
              Skip
            </Button>
          </div>
        )}
      </div>
    );

  if (outcome === 'confirmed')
    return (
      <div className="mb-3" data-testid="power-on" data-power-on="confirmed">
        <div className={`${ROW} text-white/90`}>Matches the simulation.</div>
      </div>
    );

  const fixable = findings.some(isFixable);

  return (
    <div className="mb-3" data-testid="power-on" data-power-on={outcome ?? 'idle'}>
      {refusal &&
        (findings.length ? findings : [null]).map((finding) => (
          <div
            key={finding ? `${finding.kind}-${finding.id}` : 'refusal'}
            data-joint={finding?.jointId ?? refusal.jointId}
            className={ROW}
          >
            <span className="min-w-0 text-white">{finding ? describeFinding(finding, joints) : refusal.message}</span>
          </div>
        ))}
      {fixable && (
        <Button variant="secondary" fullWidth onClick={onFix}>
          Fix
        </Button>
      )}
      {!fixable && canCheckPower(joints, calibrations) && (
        <Button variant="secondary" fullWidth onClick={onCheck}>
          Check Servos
        </Button>
      )}
    </div>
  );
};
