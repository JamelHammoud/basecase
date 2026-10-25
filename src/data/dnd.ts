export const PART_DRAG_TYPE = 'application/x-robotics-part';
export const MODEL_DRAG_TYPE = 'application/x-robotics-model';
export const ROBOT_DRAG_TYPE = 'application/x-robotics-robot';
export const SIMREADY_DRAG_TYPE = 'application/x-basecase-simready';

export function isSceneDrag(types: readonly string[]): boolean {
  return [PART_DRAG_TYPE, MODEL_DRAG_TYPE, ROBOT_DRAG_TYPE, SIMREADY_DRAG_TYPE].some((t) => types.includes(t));
}
