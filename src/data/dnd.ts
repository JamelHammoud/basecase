export const PART_DRAG_TYPE = 'application/x-robotics-part';
export const MODEL_DRAG_TYPE = 'application/x-robotics-model';
export const ROBOT_DRAG_TYPE = 'application/x-robotics-robot';

export function isSceneDrag(types: readonly string[]): boolean {
  return types.includes(PART_DRAG_TYPE) || types.includes(MODEL_DRAG_TYPE) || types.includes(ROBOT_DRAG_TYPE);
}
