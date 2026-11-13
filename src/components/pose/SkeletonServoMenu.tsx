import React from 'react';
import { ContextMenu } from '../../design-system';
import { servoUp } from '../../utils/skeletonMargins';
import type { SkeletonEdit } from '../../workspace/useSkeletonEdit';

export const SkeletonServoMenu: React.FC<{ skeleton: SkeletonEdit }> = ({ skeleton }) => {
  const { menu, skeleton: current } = skeleton;
  const joint = menu && current?.joints.find((j) => j.id === menu.id);
  const up = joint ? servoUp(joint.actuator) : null;

  if (!menu || !current || !up) return null;

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      items={[{ label: up.name, onSelect: () => skeleton.upgrade(menu.id) }]}
      onClose={skeleton.closeMenu}
    />
  );
};
