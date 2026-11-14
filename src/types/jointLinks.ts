import type { LoopClosure } from './loopClosure';
import type { OnshapeMate } from './robotLink';

export interface JointLinks {
  onshape?: OnshapeMate;
  loop?: LoopClosure;
  gearTrain?: string[];
}
