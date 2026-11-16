import type { V3 } from '../utils/kinematics';

export interface PassiveJoint {
  type: 'revolute' | 'prismatic';
  origin: V3;
  axis: V3;
  range: [number, number];
  damping: number;
  frictionloss: number;
  locked?: boolean;
}
