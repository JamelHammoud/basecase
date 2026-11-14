import type { RobotPoseState } from '../../../types/robotics';
import { posedPort } from '../../../utils/posedPort';
import type { JointDragStep } from '../../useSkeletonEdit';
import type { Studio } from '../types';

type Payload = Record<string, unknown>;

export default function poseStudio(studio: Studio) {
  return {
    posing: () => studio().core.posing,
    setPose: (values: Record<string, number>, root?: RobotPoseState['root']) =>
      studio().core.posing.setPose({ values, root }),
    posedPort: (id: string, port: string) => {
      const { core } = studio();
      const part = core.docs.partsRef.current.find((p) => p.id === id);
      const { rig, pose } = core.posing;

      return part ? posedPort(rig, pose, { part, port }) : null;
    },
    dragSkeleton: (step: Omit<JointDragStep, 'phase'>) => {
      const { skeleton } = studio().core;

      skeleton.drag({ ...step, phase: 'start' });
      skeleton.drag({ ...step, phase: 'move' });
      skeleton.drag({ ...step, phase: 'end' });
    },
    skeletonEditing: () => studio().core.skeleton.editing,
    poseTool: (kind: string, payload: Payload) => studio().agent.requests.poseTool(kind, payload),
  };
}
