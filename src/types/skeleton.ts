export type ZUpVec = [number, number, number];

export type SkeletonLimb = 'leg' | 'arm' | 'neck' | 'torso' | 'other';

export interface SkeletonJoint {
  id: string;
  name?: string;
  parent?: string;
  origin: ZUpVec;
  axis: ZUpVec;
  type?: 'revolute' | 'prismatic';
  range?: [number, number];
  limb?: SkeletonLimb;
  actuator?: string;
  tip?: ZUpVec;
  linkMassG?: number;
}

export interface RobotSkeleton {
  frame: 'z-up';
  joints: SkeletonJoint[];
  pairs: Array<[string, string]>;
  massG?: number;
}
