import type { RobotRun } from '../robot/runBuffer';
import type { SimModel } from '../sim/mjcfTypes';

export function parkedBodyRun(model: SimModel): RobotRun {
  const joints = model.joints.map((joint) => joint.id);
  const positions = model.joints.map(
    (joint) => (model.initial.values[joint.id] ?? 0) * (joint.type === 'revolute' ? Math.PI / 180 : 0.001),
  );
  const frames = Array.from({ length: 65 }, (_, index) => ({ at: index * 31.25, positions: [...positions] }));

  return {
    joints,
    statuses: frames,
    intents: frames.map((frame) => ({ at: frame.at, joints: [...positions] })),
    faultJoint: null,
    faultAt: 0,
    message: '',
  };
}
