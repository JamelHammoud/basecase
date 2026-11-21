import { useEffect, useRef } from 'react';
import type { SlotRobot } from '../cases/slots';
import type { RobotJoint, ScenePart } from '../types/robotics';

interface Source {
  scope: unknown;
  parts: ScenePart[];
  joints: RobotJoint[];
  partners: () => SlotRobot[];
}

interface Held {
  valid: boolean;
  partners: SlotRobot[];
}

export function useTryEvidence({ scope, parts, joints, partners }: Source) {
  const held = useRef<Held | null>(null);

  useEffect(
    () => () => {
      if (held.current) held.current.valid = false;
    },
    [scope, parts, joints],
  );

  return {
    begin: () => {
      held.current = { valid: true, partners: partners() };
    },
    clear: () => {
      held.current = null;
    },
    current: () => {
      const saved = held.current;
      const current = partners();

      return (
        !!saved?.valid &&
        current.length === saved.partners.length &&
        current.every(
          (robot, i) => robot.parts === saved.partners[i].parts && robot.joints === saved.partners[i].joints,
        )
      );
    },
  };
}
