import type { OnshapeMate } from './robotLink';
import type { LoopClosure } from './loopClosure';

export interface RobotJoint {
  id: string;
  name: string;
  type: 'revolute' | 'prismatic' | 'fixed';
  parent: string[];
  child: string[];
  parentJoint?: string;
  origin: [number, number, number];
  axis: [number, number, number];
  frame?: { part: string; origin: [number, number, number]; axis: [number, number, number] };
  range?: [number, number];
  actuation?: 'powered' | 'passive';
  damping?: number;
  frictionloss?: number;
  actuators?: string[];
  effortNm?: number;
  velocity?: number;
  published?: string;
  limb?: 'leg' | 'arm' | 'neck' | 'torso' | 'other';
  onshape?: OnshapeMate;
  loop?: LoopClosure;
}
