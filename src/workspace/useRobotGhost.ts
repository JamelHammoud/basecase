import { useEffect } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { connectedFrom } from '../robot/calibrationSession';
import { robotGhost, type RobotGhost } from '../robot/robotGhost';
import { subscribeTwin, twinSnapshot } from '../robot/robotTwin';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';

interface RobotGhostOptions {
  rig: Rig;
  parts: ScenePart[];
  joints: RobotJoint[] | undefined;
  viewportRef: React.RefObject<Viewport3DHandle | null>;
}

export function useRobotGhost({ rig, parts, joints, viewportRef }: RobotGhostOptions) {
  useEffect(() => {
    const ids = parts.map((p) => p.id);
    const draw = (ghost: RobotGhost | null) => viewportRef.current?.setGhost(ghost);
    const show = () => {
      const twin = twinSnapshot();

      draw(twin && connectedFrom(joints ?? []) ? robotGhost(rig, ids, twin) : null);
    };

    show();

    const unsubscribe = subscribeTwin(show);

    return () => {
      unsubscribe();
      draw(null);
    };
  }, [rig, parts, joints, viewportRef]);
}
