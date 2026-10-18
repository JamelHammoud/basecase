/** Drag-and-drop payload types for dragging parts, models and robots onto the canvas */
export const PART_DRAG_TYPE = 'application/x-robotics-part';
export const MODEL_DRAG_TYPE = 'application/x-robotics-model';
/** JSON `{ url, name }`: a robot description to import where it's dropped */
export const ROBOT_DRAG_TYPE = 'application/x-robotics-robot';

export function isSceneDrag(types: readonly string[]): boolean {
  return types.includes(PART_DRAG_TYPE) || types.includes(MODEL_DRAG_TYPE) || types.includes(ROBOT_DRAG_TYPE);
}
