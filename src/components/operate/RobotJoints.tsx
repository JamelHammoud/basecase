import React from 'react';
import { SectionHeader } from '../../design-system';
import { radiansFromCounts, type JointStatus } from '../../robot/robotState';

const REPLIES: Record<string, string> = {
  missing: 'No reply',
  garbled: 'Garbled reply',
  wrong_id: 'Wrong ID answered',
};

const degrees = (counts: number) => ((radiansFromCounts(counts) * 180) / Math.PI).toFixed(1);

function JointRow({ joint, id }: { joint: JointStatus | undefined; id: number }) {
  const position = joint?.position;
  const answered = joint?.reply === 'ok' && typeof position === 'number';

  return (
    <div
      data-robot-joint={id}
      data-position={typeof position === 'number' ? position : ''}
      className="h-8 px-1 flex items-center justify-between gap-3 text-[13px]"
    >
      <span className="text-white/80">Servo {id}</span>
      {answered ? (
        <span className="flex items-baseline gap-[12px] tabular-nums text-white/90">
          <span>
            {degrees(position)}
            <span className="text-white/45">°</span>
          </span>
          {typeof joint.temp_c === 'number' && (
            <span className="text-white/45">
              {joint.temp_c.toFixed(0)}
              <span> °C</span>
            </span>
          )}
        </span>
      ) : (
        <span className="text-white/45">{REPLIES[joint?.reply ?? 'missing'] ?? 'No reply'}</span>
      )}
    </div>
  );
}

interface RobotJointsProps {
  ids: number[];
  joints: JointStatus[];
  bare?: boolean;
}

export const RobotJoints: React.FC<RobotJointsProps> = ({ ids, joints, bare }) => (
  <div className={bare ? '' : 'mb-3'}>
    {!bare && <SectionHeader title="Emulated servos" />}
    {ids.map((id) => (
      <JointRow key={id} id={id} joint={joints.find((j) => j.id === id)} />
    ))}
  </div>
);
