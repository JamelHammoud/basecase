import type { V3 } from '../utils/kinematics';

export interface PassiveJoint {
  type: 'revolute' | 'prismatic';
  origin: V3;
  axis: V3;
  range: [number, number];
  damping: number;
  frictionloss: number;
  stiffness?: number;
  springref?: number;
  locked?: boolean;
}

export function jointSpringAttrs(joint: { type: string; stiffness?: number; springref?: number }): string {
  if (joint.stiffness === undefined && joint.springref === undefined) return '';

  const unit = joint.type === 'revolute' ? Math.PI / 180 : 0.001;

  return ` stiffness="${joint.stiffness ?? 0}" springref="${(joint.springref ?? 0) * unit}"`;
}
