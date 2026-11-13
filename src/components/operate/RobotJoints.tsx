import React from 'react';
import { Button, SectionHeader } from '../../design-system';
import { signedDegrees } from '../../robot/robotGhost';
import { radiansFromCounts, type JointStatus } from '../../robot/robotState';
import { useRobotTwin } from '../../robot/robotTwin';

const REPLIES: Record<string, string> = {
  missing: 'No reply',
  garbled: 'Garbled reply',
  wrong_id: 'Wrong ID answered',
};

const degrees = (counts: number) => ((radiansFromCounts(counts) * 180) / Math.PI).toFixed(1);

export interface JointCalibrate {
  disabled: boolean;
  onCalibrate: (jointId: string) => void;
}

interface JointRowProps {
  joint: JointStatus | undefined;
  id: number;
  gap: number | null;
  lagging: string | null;
  calibrate?: JointCalibrate;
}

function Temperature({ celsius }: { celsius: number | null }) {
  return (
    typeof celsius === 'number' && (
      <span className="text-white/50">
        {celsius.toFixed(0)}
        <span> °C</span>
      </span>
    )
  );
}

function JointRow({ joint, id, gap, lagging, calibrate }: JointRowProps) {
  const position = joint?.position;
  const answered = joint?.reply === 'ok' && typeof position === 'number';

  return (
    <div
      data-robot-joint={id}
      data-position={typeof position === 'number' ? position : ''}
      data-gap={gap === null ? '' : (gap * 180) / Math.PI}
      className="h-8 px-1 flex items-center justify-between gap-3 text-[13px] whitespace-nowrap"
    >
      <span className="text-white/80">Servo {id}</span>
      {answered ? (
        <span className="flex items-baseline gap-[12px] tabular-nums text-white/90">
          <span>
            {degrees(position)}
            <span className="text-white/50">°</span>
          </span>
          {gap !== null && <span className="text-[#0d99ff]">{signedDegrees(gap)}</span>}
          {lagging && calibrate ? (
            <Button
              size="xs"
              variant="secondary"
              disabled={calibrate.disabled}
              onClick={() => calibrate.onCalibrate(lagging)}
            >
              Calibrate
            </Button>
          ) : (
            <Temperature celsius={joint.temp_c} />
          )}
        </span>
      ) : (
        <span className="text-white/50">{REPLIES[joint?.reply ?? 'missing'] ?? 'No reply'}</span>
      )}
    </div>
  );
}

interface RobotJointsProps {
  ids: number[];
  joints: JointStatus[];
  bare?: boolean;
  calibrate?: JointCalibrate;
}

export const RobotJoints: React.FC<RobotJointsProps> = ({ ids, joints, bare, calibrate }) => {
  const twin = useRobotTwin();

  return (
    <div className={bare ? '' : 'mb-3'}>
      {!bare && <SectionHeader title="Emulated servos" />}
      {ids.map((id, k) => {
        const jointId = twin?.joints[k] ?? null;

        return (
          <JointRow
            key={id}
            id={id}
            joint={joints.find((j) => j.id === id)}
            gap={twin?.gaps[k] ?? null}
            lagging={jointId && twin?.lagging.has(jointId) ? jointId : null}
            calibrate={calibrate}
          />
        );
      })}
    </div>
  );
};
